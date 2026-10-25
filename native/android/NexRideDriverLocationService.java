package com.nexride.driver;
import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.*;
import android.location.*;
import android.os.*;
import org.json.JSONObject;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;

/** Foreground GPS only while Online. Never stores a bearer token on disk.
 * The server will exclude this driver once fresh GPS or authorization expires. */
public final class NexRideDriverLocationService extends Service implements LocationListener {
  public static final String START="com.nexride.driver.location.START", STOP="com.nexride.driver.location.STOP";
  public static final String TOKEN="accessToken";
  private static final String CHANNEL="nexride_driver_tracking";
  private static volatile boolean running=false;
  private final ExecutorService network=Executors.newSingleThreadExecutor();
  private LocationManager manager;
  private volatile String bearer="";
  private long lastUpload=0;
  private volatile boolean unauthorized=false;
  public static boolean isRunning(){return running;}
  @Override public void onCreate(){
    super.onCreate();
    manager=(LocationManager)getSystemService(LOCATION_SERVICE);
    if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.O){
      ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(
        new NotificationChannel(CHANNEL,"Driver location sharing",NotificationManager.IMPORTANCE_LOW));
    }
  }
  @Override public int onStartCommand(Intent intent,int flags,int startId){
    if(intent==null || STOP.equals(intent.getAction())){stopSelf();return START_NOT_STICKY;}
    String token=intent.getStringExtra(TOKEN);
    if(token==null || token.length()<20){stopSelf();return START_NOT_STICKY;}
    bearer=token;
    unauthorized=false;
    if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED &&
       checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED){
      stopSelf();return START_NOT_STICKY;
    }
    PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),
      PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    Notification.Builder notification=Build.VERSION.SDK_INT>=Build.VERSION_CODES.O
      ? new Notification.Builder(this,CHANNEL) : new Notification.Builder(this);
    Notification notice=notification.setContentTitle("Biloo Driver · Online")
      .setContentText("Sharing location for nearby ride requests")
      .setSmallIcon(android.R.drawable.ic_menu_mylocation).setOngoing(true)
      .setContentIntent(open).build();
    try{
      if(Build.VERSION.SDK_INT>=29)startForeground(2401,notice,ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
      else startForeground(2401,notice);
      if(!running){
        running=true;
        if(manager.isProviderEnabled(LocationManager.GPS_PROVIDER))
          manager.requestLocationUpdates(LocationManager.GPS_PROVIDER,12000,12f,this,Looper.getMainLooper());
        if(manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER))
          manager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER,25000,20f,this,Looper.getMainLooper());
      }
    }catch(SecurityException|IllegalStateException e){stopSelf();return START_NOT_STICKY;}
    return START_NOT_STICKY; // Never restart a terminated service with expired session credentials.
  }
  @Override public void onLocationChanged(Location fix){
    if(!running || unauthorized || !fix.hasAccuracy() || fix.getAccuracy()<0 || fix.getAccuracy()>150 ||
      Math.abs(fix.getLatitude())>90 || Math.abs(fix.getLongitude())>180)return;
    long elapsed=SystemClock.elapsedRealtime(),age=elapsed-fix.getElapsedRealtimeNanos()/1000000;
    if(age<0 || age>30000 || elapsed-lastUpload<10000)return;
    lastUpload=elapsed;
    final long timestamp=System.currentTimeMillis()-age;
    final double lat=fix.getLatitude(),lng=fix.getLongitude(),accuracy=fix.getAccuracy();
    final String token=bearer;
    network.execute(()->{
      HttpURLConnection connection=null;
      try{
        JSONObject position=new JSONObject().put("latitude",lat).put("longitude",lng)
          .put("accuracy",accuracy).put("fix_timestamp",timestamp);
        byte[] body=new JSONObject().put("location",position).toString().getBytes(StandardCharsets.UTF_8);
        connection=(HttpURLConnection)new URL("https://ubberapp.vercel.app/api/driver/availability").openConnection();
        connection.setRequestMethod("PATCH");
        connection.setDoOutput(true);connection.setConnectTimeout(10000);connection.setReadTimeout(10000);
        connection.setRequestProperty("Authorization","Bearer "+token);
        connection.setRequestProperty("Content-Type","application/json");
        try(OutputStream out=connection.getOutputStream()){out.write(body);}
        int status=connection.getResponseCode();
        // A revoked or expired session must not continue broadcasting GPS.
        // The foreground UI will reconcile and restart with a refreshed JWT.
        if(status==401 || status==403){
          unauthorized=true;
          bearer="";
          stopSelf();
        }
      }catch(Exception ignored){}finally{if(connection!=null)connection.disconnect();}
    });
  }
  @Override public IBinder onBind(Intent intent){return null;}
  @Override public void onDestroy(){
    running=false;bearer="";
    if(manager!=null)manager.removeUpdates(this);
    network.shutdownNow();
    super.onDestroy();
  }
}
