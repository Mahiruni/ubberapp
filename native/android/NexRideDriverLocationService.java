package com.nexride.driver;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Explicit, foreground-started Driver location sharing. Continues while the screen
 * is locked or the WebView is paused; never restarts on boot or process death.
 * Access/refresh tokens exist only in service memory (never SharedPreferences).
 * Server authorization, GPS age and accuracy are the dispatch authority.
 */
public final class NexRideDriverLocationService extends Service implements LocationListener {
  public static final String START="com.nexride.driver.location.START";
  public static final String TOKEN="accessToken", REFRESH="refreshToken", AUTH_URL="authUrl", API_KEY="publishableKey";
  private static final String CHANNEL="nexride_driver_tracking";
  private static final int NOTIFICATION_ID=2401;
  private static final String AVAILABILITY_URL="https://ubberapp.vercel.app/api/driver/availability";
  private final ExecutorService network=Executors.newSingleThreadExecutor();
  private final AtomicBoolean uploading=new AtomicBoolean(false);
  private LocationManager manager;
  private volatile String bearer="", refresh="", authUrl="", apiKey="", lastError="waiting_for_gps";
  private volatile long lastServerAckAt=0, lastGoodFixAt=0;
  private volatile float lastAccuracy=Float.NaN;
  private volatile boolean running=false;
  private long lastAttemptElapsed=0;

  public boolean isActive(){ return running; }
  public long getLastServerAckAt(){ return lastServerAckAt; }
  public long getLastGoodFixAt(){ return lastGoodFixAt; }
  public float getLastAccuracy(){ return lastAccuracy; }
  public String getLastError(){ return lastError; }

  @Override public void onCreate(){
    super.onCreate();
    manager=(LocationManager)getSystemService(LOCATION_SERVICE);
    if(Build.VERSION.SDK_INT>=26){
      NotificationChannel channel=new NotificationChannel(CHANNEL,"Driver location sharing",NotificationManager.IMPORTANCE_LOW);
      channel.setDescription("Location shared while Online for verified NexRide dispatch");
      channel.setSound(null,null);
      ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(channel);
    }
  }

  private void showNotification(String detail){
    Intent open=new Intent(this,MainActivity.class);
    open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
    PendingIntent tap=PendingIntent.getActivity(this,2401,open,
      PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    Notification.Builder builder=Build.VERSION.SDK_INT>=26
      ? new Notification.Builder(this,CHANNEL) : new Notification.Builder(this);
    Notification notice=builder.setContentTitle("NexRide Driver · Location sharing")
      .setContentText(detail).setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setCategory(Notification.CATEGORY_SERVICE).setOnlyAlertOnce(true)
      .setContentIntent(tap).setOngoing(true).build();
    ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).notify(NOTIFICATION_ID,notice);
  }

  private boolean permissionGranted(){
    return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED
      || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;
  }

  @Override public int onStartCommand(Intent intent,int flags,int startId){
    if(intent==null || !START.equals(intent.getAction())) { stopSelf(); return START_NOT_STICKY; }
    String token=intent.getStringExtra(TOKEN);
    String refreshValue=intent.getStringExtra(REFRESH);
    String url=intent.getStringExtra(AUTH_URL);
    String key=intent.getStringExtra(API_KEY);
    // The JS-side authenticated Supabase session is the sole start authority.
    if(token==null || token.length()<20 || refreshValue==null || refreshValue.length()<20 ||
       url==null || !url.matches("https://[a-z0-9-]+\\.supabase\\.co") ||
       key==null || key.length()<20 || !permissionGranted()){
      lastError="permission_or_session_required"; stopSelf(); return START_NOT_STICKY;
    }
    bearer=token; refresh=refreshValue; authUrl=url; apiKey=key;
    try {
      showNotification("Sharing GPS while Online · Tap to return to NexRide");
      if(Build.VERSION.SDK_INT>=29) startForeground(NOTIFICATION_ID,
        buildForegroundNotification(),ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
      else startForeground(NOTIFICATION_ID,buildForegroundNotification());
      if(!running){
        running=true;
        boolean registered=false;
        if(manager!=null && manager.isProviderEnabled(LocationManager.GPS_PROVIDER)){
          manager.requestLocationUpdates(LocationManager.GPS_PROVIDER,10_000L,0f,this,Looper.getMainLooper());
          registered=true;
        }
        if(manager!=null && manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)){
          manager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER,15_000L,0f,this,Looper.getMainLooper());
          registered=true;
        }
        if(!registered){ lastError="location_services_disabled"; showNotification("GPS disabled · Enable device Location"); }
      }
    }catch(SecurityException|IllegalStateException|IllegalArgumentException e){
      lastError="foreground_location_unavailable"; stopSelf();
    }
    return START_NOT_STICKY;
  }

  private Notification buildForegroundNotification(){
    Intent open=new Intent(this,MainActivity.class);
    PendingIntent tap=PendingIntent.getActivity(this,2401,open,
      PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    Notification.Builder builder=Build.VERSION.SDK_INT>=26
      ? new Notification.Builder(this,CHANNEL) : new Notification.Builder(this);
    return builder.setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setContentTitle("NexRide Driver · Online")
      .setContentText("Sharing location for nearby ride requests")
      .setContentIntent(tap).setOnlyAlertOnce(true).setOngoing(true).build();
  }

  @Override public void onLocationChanged(Location fix){
    if(!running || !fix.hasAccuracy() || !Float.isFinite(fix.getAccuracy()) ||
       fix.getAccuracy()<0 || fix.getAccuracy()>150 ||
       !Double.isFinite(fix.getLatitude()) || !Double.isFinite(fix.getLongitude()) ||
       Math.abs(fix.getLatitude())>90 || Math.abs(fix.getLongitude())>180){
      lastError="gps_not_accurate"; return;
    }
    long elapsed=SystemClock.elapsedRealtime();
    long age=elapsed-fix.getElapsedRealtimeNanos()/1_000_000L;
    if(age<0 || age>30_000 || elapsed-lastAttemptElapsed<10_000 ||
       !uploading.compareAndSet(false,true))return;
    lastAttemptElapsed=elapsed;
    final long timestamp=System.currentTimeMillis()-age;
    final double latitude=fix.getLatitude(),longitude=fix.getLongitude(),accuracy=fix.getAccuracy();
    network.execute(()->{
      try {
        JSONObject position=new JSONObject().put("latitude",latitude).put("longitude",longitude)
          .put("accuracy",accuracy).put("fix_timestamp",timestamp);
        byte[] body=new JSONObject().put("location",position).toString().getBytes(StandardCharsets.UTF_8);
        int status=sendLocation(body);
        if(status==401 && refreshSession())status=sendLocation(body);
        if(!running)return;
        if(status==200){
          lastServerAckAt=System.currentTimeMillis();
          lastGoodFixAt=timestamp;
          lastAccuracy=(float)accuracy;
          lastError="none";
        } else if(status==401 || status==403 || status==409) {
          // A revoked/expired session or an Offline/suspended Driver must not
          // silently continue location sharing, including after screen lock.
          lastError="driver_no_longer_authorized";
          stopSelf();
        } else {
          lastError="upload_unavailable";
        }
      }catch(Exception e){
        lastError="network_unavailable";
      }finally{uploading.set(false);}
    });
  }

  private int sendLocation(byte[] body) throws Exception {
    HttpURLConnection connection=null;
    try{
      connection=(HttpURLConnection)new URL(AVAILABILITY_URL).openConnection();
      connection.setRequestMethod("POST");connection.setDoOutput(true);
      connection.setConnectTimeout(8_000);connection.setReadTimeout(8_000);
      connection.setRequestProperty("Authorization","Bearer "+bearer);
      connection.setRequestProperty("Content-Type","application/json");
      try(OutputStream out=connection.getOutputStream()){out.write(body);}
      return connection.getResponseCode();
    }finally{if(connection!=null)connection.disconnect();}
  }

  private boolean refreshSession(){
    if(refresh.isEmpty() || authUrl.isEmpty() || apiKey.isEmpty())return false;
    HttpURLConnection connection=null;
    try{
      connection=(HttpURLConnection)new URL(authUrl+"/auth/v1/token?grant_type=refresh_token").openConnection();
      connection.setRequestMethod("POST");connection.setDoOutput(true);
      connection.setConnectTimeout(8_000);connection.setReadTimeout(8_000);
      connection.setRequestProperty("apikey",apiKey);
      connection.setRequestProperty("Content-Type","application/json");
      byte[] body=new JSONObject().put("refresh_token",refresh).toString().getBytes(StandardCharsets.UTF_8);
      try(OutputStream out=connection.getOutputStream()){out.write(body);}
      if(connection.getResponseCode()!=200)return false;
      try(InputStream input=connection.getInputStream()){
        byte[] response=input.readNBytes(32_768);
        JSONObject session=new JSONObject(new String(response,StandardCharsets.UTF_8));
        String nextBearer=session.optString("access_token","");
        String nextRefresh=session.optString("refresh_token","");
        if(nextBearer.length()<20 || nextRefresh.length()<20)return false;
        bearer=nextBearer; refresh=nextRefresh;
        return true;
      }
    }catch(Exception e){return false;}
    finally{if(connection!=null)connection.disconnect();}
  }

  @Override public void onProviderEnabled(String provider){
    if(!running || !permissionGranted() || manager==null)return;
    try { manager.requestLocationUpdates(provider,10_000L,0f,this,Looper.getMainLooper()); }
    catch(SecurityException|IllegalArgumentException ignored){lastError="location_services_disabled";}
  }
  @Override public void onProviderDisabled(String provider){
    if(!running)return;
    lastError="location_services_disabled";
  }
  @Override public IBinder onBind(Intent intent){return null;}
  @Override public void onDestroy(){
    running=false; bearer="";refresh="";authUrl="";apiKey="";
    lastServerAckAt=0;lastGoodFixAt=0;lastAccuracy=Float.NaN;
    if(manager!=null)try{manager.removeUpdates(this);}catch(SecurityException ignored){}
    network.shutdownNow();
    super.onDestroy();
  }
}
