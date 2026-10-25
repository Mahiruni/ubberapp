package com.nexride.driver;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.*;
import android.location.*;
import android.net.ConnectivityManager;
import android.net.Network;
import android.os.*;
import org.json.JSONObject;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;

/** Explicit Online location service. Zero distance filtering keeps parked Drivers fresh. */
public final class NexRideDriverLocationService extends Service implements LocationListener {
  public static final String START="com.nexride.driver.location.START", STOP="com.nexride.driver.location.STOP";
  public static final String RECEIVER="receiver", EPOCH="sessionEpoch";
  private static final String CHANNEL="nexride_driver_tracking";
  private static volatile NexRideDriverLocationService instance;
  private static volatile String reason="stopped";
  private LocationManager manager;
  private ConnectivityManager connectivity;
  private ConnectivityManager.NetworkCallback networkCallback;
  private volatile boolean active=false;
  private long sessionEpoch=0, lastAttempt=0;
  private volatile long retryAt=0;
  private volatile long lastFixAt=0, lastUploadAt=0;
  private int failures=0;
  private final AtomicBoolean uploading=new AtomicBoolean(false);
  private volatile HttpURLConnection connection;
  private PowerManager.WakeLock uploadLock;
  private void releaseUploadLock() {
    synchronized(this) { if(uploadLock!=null && uploadLock.isHeld()) uploadLock.release(); }
  }

  public static boolean isRunning() { return instance!=null && instance.active; }
  public static String state() { return reason; }
  public static long lastFixAt() { return instance==null ? 0 : instance.lastFixAt; }
  public static long lastUploadAt() { return instance==null ? 0 : instance.lastUploadAt; }
  public static void cancel(Context context,String state) {
    reason=state;
    NexRideDriverLocationService service=instance;
    if(service!=null) {
      service.active=false;
      HttpURLConnection request=service.connection;
      if(request!=null) request.disconnect();
    }
    BilooDriverSessionStore.get(context).tracking=false;
    context.stopService(new Intent(context,NexRideDriverLocationService.class));
  }
  @Override public void onCreate() {
    super.onCreate(); instance=this;
    manager=(LocationManager)getSystemService(LOCATION_SERVICE);
    connectivity=(ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);
    networkCallback=new ConnectivityManager.NetworkCallback() {
      @Override public void onAvailable(Network network) {
        retryAt=0;
        BilooDriverSessionStore.WORKER.execute(() -> { if(active) BilooDriverSessionStore.get(NexRideDriverLocationService.this).retryNow(); });
        new Handler(Looper.getMainLooper()).post(() -> {
          if(!active) return;
          reason="waiting_for_fix";
          try {
            if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED && manager.isProviderEnabled(LocationManager.GPS_PROVIDER))
              manager.requestSingleUpdate(LocationManager.GPS_PROVIDER,NexRideDriverLocationService.this,Looper.getMainLooper());
            else if(manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER))
              manager.requestSingleUpdate(LocationManager.NETWORK_PROVIDER,NexRideDriverLocationService.this,Looper.getMainLooper());
          } catch(RuntimeException ignored) { /* The regular provider subscription remains active. */ }
        });
      }
    };
    connectivity.registerDefaultNetworkCallback(networkCallback);
    if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.O) {
      ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(
        new NotificationChannel(CHANNEL,"Driver location sharing",NotificationManager.IMPORTANCE_LOW));
    }
    PowerManager power=(PowerManager)getSystemService(POWER_SERVICE);
    uploadLock=power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"com.nexride.driver:gps-upload");
    uploadLock.setReferenceCounted(false);
  }
  private Notification notification() {
    PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),
      PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    Notification.Builder builder=Build.VERSION.SDK_INT>=Build.VERSION_CODES.O
      ? new Notification.Builder(this,CHANNEL) : new Notification.Builder(this);
    return builder.setContentTitle("Biloo Driver · Online")
      .setContentText("Location sharing is active. Open Biloo to go offline.")
      .setSmallIcon(android.R.drawable.ic_menu_mylocation).setOngoing(true)
      .setVisibility(Notification.VISIBILITY_PRIVATE).setContentIntent(open).build();
  }
  private void result(ResultReceiver receiver,boolean success,String status) {
    if(receiver==null) return;
    Bundle bundle=new Bundle(); bundle.putString("status",status); receiver.send(success ? 1 : 0,bundle);
  }
  @Override public int onStartCommand(Intent intent,int flags,int startId) {
    ResultReceiver receiver=intent==null ? null : intent.getParcelableExtra(RECEIVER);
    BilooDriverSession session=BilooDriverSessionStore.get(this);
    if(intent==null || !START.equals(intent.getAction()) || intent.getLongExtra(EPOCH,-1)!=session.epoch()) {
      result(receiver,false,"session_required"); stopSelf(); return START_NOT_STICKY;
    }
    boolean fine=checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED;
    boolean coarse=checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;
    if(!fine && !coarse) { result(receiver,false,"location_permission_required"); stopSelf(); return START_NOT_STICKY; }
    try {
      if(Build.VERSION.SDK_INT>=29) startForeground(2401,notification(),ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
      else startForeground(2401,notification());
      if(!active) {
        boolean subscribed=false;
        boolean enabled=manager.isProviderEnabled(LocationManager.GPS_PROVIDER)||manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        if(fine && manager.getAllProviders().contains(LocationManager.GPS_PROVIDER)) {
          manager.requestLocationUpdates(LocationManager.GPS_PROVIDER,12000,0f,this,Looper.getMainLooper()); subscribed=true;
        }
        if(manager.getAllProviders().contains(LocationManager.NETWORK_PROVIDER)) {
          manager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER,20000,0f,this,Looper.getMainLooper()); subscribed=true;
        }
        if(!subscribed || !enabled) { reason="location_disabled"; result(receiver,false,reason); stopSelf(); return START_NOT_STICKY; }
        sessionEpoch=session.epoch(); active=true; session.tracking=true; reason="waiting_for_fix";
      }
      result(receiver,true,"started");
    } catch(RuntimeException error) {
      reason="foreground_service_not_permitted"; result(receiver,false,reason); stopSelf();
    }
    // Never silently restart a terminated Online shift.
    return START_NOT_STICKY;
  }
  private boolean usable(Location fix) {
    long age=SystemClock.elapsedRealtime()-fix.getElapsedRealtimeNanos()/1000000;
    return fix.hasAccuracy() && Float.isFinite(fix.getAccuracy()) && fix.getAccuracy()>=0 && fix.getAccuracy()<=150 &&
      Double.isFinite(fix.getLatitude()) && Math.abs(fix.getLatitude())<=90 &&
      Double.isFinite(fix.getLongitude()) && Math.abs(fix.getLongitude())<=180 && age>=0 && age<=30000;
  }
  @Override public void onLocationChanged(Location fix) {
    if(!active || !usable(fix)) return;
    long now=SystemClock.elapsedRealtime();
    lastFixAt=System.currentTimeMillis()-(now-fix.getElapsedRealtimeNanos()/1000000);
    if(now-lastAttempt<10000 || now<retryAt || connectivity.getActiveNetwork()==null || !uploading.compareAndSet(false,true)) return;
    lastAttempt=now;
    final long observationEpoch=sessionEpoch;
    Location observation=new Location(fix);
    synchronized(this) { uploadLock.acquire(45000); }
    BilooDriverSessionStore.WORKER.execute(() -> {
      BilooDriverSession session=BilooDriverSessionStore.get(this);
      try {
        if(!active || session.epoch()!=observationEpoch) return;
        JSONObject credentials=session.fresh(false,observationEpoch);
        if(!session.usable(credentials)) { if(active) reason="session_refresh_wait"; return; }
        if(!active || !usable(observation)) return;
        int status=upload(observation,credentials.getString("access_token"),observationEpoch);
        if(!active || session.epoch()!=observationEpoch) return;
        if(status==401 && active) {
          long before=session.refreshVersion();
          credentials=session.fresh(true,observationEpoch);
          if(!active || session.epoch()!=observationEpoch) return;
          if(session.refreshVersion()==before) { backoff(); reason="session_refresh_wait"; return; }
          if(!session.usable(credentials) || !usable(observation)) return;
          status=upload(observation,credentials.getString("access_token"),observationEpoch);
          if(status==401) session.revokeCurrent(observationEpoch);
        }
        if(!active || session.epoch()!=observationEpoch) return;
        if(status>=200 && status<300) {
          lastUploadAt=System.currentTimeMillis(); reason="ready"; failures=0; retryAt=0;
        } else if(status==403 || status==409) {
          cancel(this,status==409 ? "driver_offline" : "account_unavailable");
        } else if(status!=401) { backoff(); }
      } catch(Exception error) {
        if(active) backoff();
      } finally {
        uploading.set(false);
        releaseUploadLock();
      }
    });
  }
  private void backoff() {
    failures=Math.min(6,failures+1);
    retryAt=SystemClock.elapsedRealtime()+Math.min(60000,2000L*(1L<<(failures-1)));
    reason="reconnecting";
  }
  private int upload(Location fix,String token,long observationEpoch) throws Exception {
    long age=SystemClock.elapsedRealtime()-fix.getElapsedRealtimeNanos()/1000000;
    JSONObject position=new JSONObject().put("latitude",fix.getLatitude()).put("longitude",fix.getLongitude())
      .put("accuracy",fix.getAccuracy()).put("fix_timestamp",System.currentTimeMillis()-age)
      .put("heading_degrees",fix.hasBearing() ? fix.getBearing() : JSONObject.NULL);
    HttpURLConnection request=(HttpURLConnection)new URL("https://ubberapp.vercel.app/api/driver/availability").openConnection();
    connection=request;
    try {
      if(!active || BilooDriverSessionStore.get(this).epoch()!=observationEpoch) return 409;
      request.setInstanceFollowRedirects(false); request.setRequestMethod("POST");
      request.setDoOutput(true); request.setConnectTimeout(4000); request.setReadTimeout(6000);
      request.setRequestProperty("Authorization","Bearer "+token); request.setRequestProperty("Content-Type","application/json");
      try(OutputStream out=request.getOutputStream()) { out.write(new JSONObject().put("location",position).put("native_tracking",true).toString().getBytes(StandardCharsets.UTF_8)); }
      return request.getResponseCode();
    } finally { request.disconnect(); if(connection==request) connection=null; }
  }
  @Override public void onProviderDisabled(String provider) { if(active) reason="location_disabled"; }
  @Override public void onProviderEnabled(String provider) { if(active) reason="waiting_for_fix"; }
  @Override public void onStatusChanged(String provider,int status,Bundle extras) { /* Android 7–10. */ }
  @Override public IBinder onBind(Intent intent) { return null; }
  @Override public void onDestroy() {
    active=false;
    BilooDriverSessionStore.get(this).tracking=false;
    if(manager!=null) { try { manager.removeUpdates(this); } catch(SecurityException ignored) {} }
    if(connection!=null) connection.disconnect();
    if(networkCallback!=null) { try { connectivity.unregisterNetworkCallback(networkCallback); } catch(RuntimeException ignored) {} }
    releaseUploadLock();
    stopForeground(STOP_FOREGROUND_REMOVE);
    if(instance==this) instance=null;
    super.onDestroy();
  }
}
