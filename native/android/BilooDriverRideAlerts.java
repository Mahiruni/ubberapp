package com.nexride.driver;

import android.app.*;
import android.content.*;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.widget.RemoteViews;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import org.json.JSONObject;
import java.util.*;

/** Android owns the ringtone and timeout, including after the WebView/process disappears. */
public final class BilooDriverRideAlerts {
  private static final String PREFS="biloo.driver.ride-alerts.v1";
  private static final int ID=73141, TEST_ID=73142;
  private static final Handler MAIN=new Handler(Looper.getMainLooper());
  private static Runnable expiry;
  private BilooDriverRideAlerts() {}
  private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS,Context.MODE_PRIVATE); }
  private static BilooRideAlertState state(Context c) {
    SharedPreferences p=prefs(c);
    return new BilooRideAlertState(new BilooRideAlertState.Store() {
      public String read() { return p.getString("state","{}"); }
      public void write(String value) { p.edit().putString("state",value).commit(); }
    });
  }
  private static NotificationManager manager(Context c) { return (NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE); }
  private static String clean(String value,int max) { return value==null?"":value.replaceAll("[\\r\\n\\t]"," ").trim().substring(0,Math.min(max,value.replaceAll("[\\r\\n\\t]"," ").trim().length())); }
  private static long number(String value) { try { return Long.parseLong(value); } catch(Exception ignored) { return 0; } }
  public static synchronized void configure(Context c,String user,boolean enabled,boolean sound,boolean vibration,String language) throws Exception {
    if(!state(c).user().equals(user) && !user.equals(prefs(c).getString("registeredUser",""))) prefs(c).edit().remove("registeredUser").apply();
    if(state(c).configure(user,enabled,sound,vibration,language,System.currentTimeMillis())) {
      manager(c).cancel(ID); prefs(c).edit().remove("actionNonce").remove("pendingAction").apply();
    }
  }
  /** User app preferences choose a named profile; Android's channel choices remain authoritative. */
  private static String channel(Context c,BilooRideAlertState s) {
    NexRideDriverAlertChannels.ensure(c);
    String base=NexRideDriverAlertChannels.RIDE_REQUESTS;
    if(Build.VERSION.SDK_INT<26 || (s.sounds() && s.vibration())) return base;
    NotificationManager m=manager(c); NotificationChannel parent=m.getNotificationChannel(base);
    if(parent==null || parent.getImportance()==NotificationManager.IMPORTANCE_NONE) return base;
    String id="biloo_driver_requests_"+(s.sounds()?"sound":s.vibration()?"vibration":"quiet")+"_v1";
    if(m.getNotificationChannel(id)==null) {
      NotificationChannel profile=new NotificationChannel(id,"Ride requests · "+(s.sounds()?"sound":s.vibration()?"vibration":"silent"),parent.getImportance());
      profile.setDescription("BILOO ride alerts using your app sound and vibration preferences");
      profile.setSound(s.sounds()?parent.getSound():null,parent.getAudioAttributes());
      profile.enableVibration(s.vibration() && parent.shouldVibrate());
      profile.setVibrationPattern(parent.getVibrationPattern()); profile.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
      m.createNotificationChannel(profile);
    }
    return id;
  }
  private static PendingIntent action(Context c,String id,String user,String action,String nonce,long end) {
    Intent intent=new Intent(c,MainActivity.class).setAction("com.nexride.driver.RIDE_ALERT")
      .setData(Uri.parse("biloo://ride-alert/"+id+"/"+action))
      .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP)
      .putExtra("offerId",id).putExtra("userId",user).putExtra("rideAction",action)
      .putExtra("actionNonce",nonce).putExtra("expiresAt",end);
    return PendingIntent.getActivity(c,0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  }
  private static Notification build(Context c,BilooRideAlertState s,Map<String,String> data,long remaining,boolean test,String nonce) {
    String id=data.get("offerId"), user=data.get("userId"), channel=channel(c,s);
    boolean am="am".equals(s.language());
    String title=test?(am?"የሙከራ ጉዞ ማንቂያ":"Test ride alert"):(am?"አዲስ የጉዞ ጥያቄ":"New ride request");
    String pickup=clean(data.get("pickup"),120), detail=clean(data.get("detail"),120);
    if(pickup.isEmpty()) pickup=am?"ጥያቄውን ለማየት BILOO ይክፈቱ":"Open BILOO to review the pickup";
    long end=System.currentTimeMillis()+remaining;
    PendingIntent open=action(c,id,user,test?"test":"open",nonce,end);
    NotificationCompat.Builder b=new NotificationCompat.Builder(c,channel)
      .setSmallIcon(R.drawable.biloo_ride_notification).setColor(Color.rgb(245,199,94))
      .setContentTitle(title).setContentText(pickup).setSubText("BILOO · DRIVER")
      .setPriority(NotificationCompat.PRIORITY_MAX).setCategory(NotificationCompat.CATEGORY_EVENT)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setContentIntent(open).setAutoCancel(true)
      .setTimeoutAfter(remaining).setLocalOnly(true)
      .setPublicVersion(new NotificationCompat.Builder(c,channel).setSmallIcon(R.drawable.biloo_ride_notification)
        .setContentTitle(title).setContentText(am?"ዝርዝሮችን ለማየት ስልክዎን ይክፈቱ":"Unlock to review your ride request").build());
    RemoteViews view=new RemoteViews(c.getPackageName(),R.layout.biloo_driver_ride_alert);
    view.setTextViewText(R.id.biloo_alert_title,title); view.setTextViewText(R.id.biloo_alert_pickup,pickup);
    view.setTextViewText(R.id.biloo_alert_detail,detail.isEmpty()?(am?"ለመቀበል ወይም ለመከልከል ይንኩ":"Accept or decline before the timer ends"):detail);
    view.setChronometer(R.id.biloo_alert_deadline,SystemClock.elapsedRealtime()+remaining,"%s",true);
    view.setChronometerCountDown(R.id.biloo_alert_deadline,true);
    b.setStyle(new NotificationCompat.DecoratedCustomViewStyle()).setCustomBigContentView(view).setCustomHeadsUpContentView(view);
    if(!test) {
      b.addAction(0,am?"ተቀበል":"Accept",action(c,id,user,"accept",nonce,end));
      b.addAction(0,am?"አልቀበልም":"Decline",action(c,id,user,"decline",nonce,end));
      Intent dismissed=new Intent(c,BilooRideAlertDismissReceiver.class).setData(Uri.parse("biloo://dismiss/"+id))
        .putExtra("offerId",id).putExtra("userId",user);
      b.setDeleteIntent(PendingIntent.getBroadcast(c,0,dismissed,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
    }
    if(Build.VERSION.SDK_INT<26) {
      if(s.sounds()) b.setSound(Uri.parse("android.resource://"+c.getPackageName()+"/"+R.raw.nexride_ride_request));
      if(s.vibration()) b.setVibrate(new long[]{0,220,120,220,120,420});
    } else {
      NotificationChannel parent=manager(c).getNotificationChannel(NexRideDriverAlertChannels.RIDE_REQUESTS);
      if(parent!=null && ((!s.sounds() && !s.vibration()) ||
        (s.sounds() && !s.vibration() && parent.getSound()==null) ||
        (!s.sounds() && s.vibration() && !parent.shouldVibrate()))) b.setSilent(true);
    }
    Notification result=b.build();
    // API 26+ system timeout bounds repetition even if this process is killed.
    // Older devices receive the finite bundled chime, without an unbounded loop.
    if(Build.VERSION.SDK_INT>=26 && (s.sounds() || s.vibration())) result.flags|=Notification.FLAG_INSISTENT;
    return result;
  }
  public static synchronized boolean show(Context c,Map<String,String> data,boolean test) {
    try {
      BilooRideAlertState s=state(c);
      String channel=channel(c,s);
      if(Build.VERSION.SDK_INT>=33 && c.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED) return false;
      if(!NotificationManagerCompat.from(c).areNotificationsEnabled()) return false;
      if(Build.VERSION.SDK_INT>=26 && manager(c).getNotificationChannel(channel).getImportance()==NotificationManager.IMPORTANCE_NONE) return false;
      if(test) {
        JSONObject active=s.active();
        if(active!=null && active.optLong("deadline")>System.currentTimeMillis()) return false;
        manager(c).notify(TEST_ID,build(c,s,data,5000,true,"")); return true;
      }
      long remaining=s.receive(data.get("offerId"),data.get("userId"),number(data.get("expiresAtMs")),number(data.get("issuedAtMs")),System.currentTimeMillis(),SystemClock.elapsedRealtime());
      if(remaining==0) return false;
      String nonce=UUID.randomUUID().toString();
      prefs(c).edit().putString("actionNonce",nonce).apply();
      manager(c).cancel(ID);
      manager(c).notify(ID,build(c,s,data,remaining,false,nonce)); s.displayed(System.currentTimeMillis());
      if(expiry!=null) MAIN.removeCallbacks(expiry);
      String id=data.get("offerId"), user=data.get("userId");
      expiry=() -> close(c,id,user); MAIN.postDelayed(expiry,remaining);
      return true;
    } catch(Exception error) {
      // No payload, pickup, token, or session data is written to Android logs.
      manager(c).cancel(ID); return false;
    }
  }
  public static synchronized void close(Context c,String id,String user) {
    try {
      if(state(c).close(id,user,System.currentTimeMillis())) {
        manager(c).cancel(ID); prefs(c).edit().remove("actionNonce").apply();
        if(expiry!=null) MAIN.removeCallbacks(expiry);
      }
    } catch(Exception ignored) { manager(c).cancel(ID); }
  }
  public static synchronized void closeCurrent(Context c,String id) { close(c,id,state(c).user()); }
  public static synchronized void registered(Context c,String user) {
    if(!user.isEmpty()) prefs(c).edit().putString("registeredUser",user).apply();
  }
  public static synchronized void tokenChanged(Context c) { prefs(c).edit().remove("registeredUser").apply(); }
  public static synchronized void clear(Context c,boolean disable) {
    try {
      BilooRideAlertState s=state(c);
      if(disable) s.configure("",false,s.sounds(),s.vibration(),s.language(),System.currentTimeMillis());
      else s.clear(System.currentTimeMillis());
      SharedPreferences.Editor edit=prefs(c).edit().remove("actionNonce");
      if(disable) edit.remove("registeredUser").remove("pendingAction"); edit.apply();
    } catch(Exception ignored) {}
    manager(c).cancel(ID); manager(c).cancel(TEST_ID);
    if(expiry!=null) MAIN.removeCallbacks(expiry);
  }
  /** Exported launcher intents cannot forge an action: nonce is private and single-use. */
  public static synchronized void captureIntent(Context c,Intent intent) {
    if(intent==null || !"com.nexride.driver.RIDE_ALERT".equals(intent.getAction())) return;
    try {
      BilooRideAlertState s=state(c); JSONObject active=s.active();
      String id=intent.getStringExtra("offerId"), user=intent.getStringExtra("userId"), action=intent.getStringExtra("rideAction");
      String expected=prefs(c).getString("actionNonce","");
      if(active==null || expected.isEmpty() || !expected.equals(intent.getStringExtra("actionNonce")) ||
        !s.user().equals(user) || !active.optString("id").equals(id) || !Arrays.asList("open","accept","decline").contains(action)) return;
      long deadline=active.optLong("deadline");
      s.opened(); close(c,id,user);
      prefs(c).edit().putString("pendingAction",new JSONObject().put("offerId",id).put("userId",user)
        .put("action",deadline<=System.currentTimeMillis()?"expired":action).put("expiresAt",deadline).toString()).commit();
      intent.removeExtra("actionNonce");
    } catch(Exception ignored) {}
  }
  public static synchronized JSONObject consumeAction(Context c,String user) throws Exception {
    String pending=prefs(c).getString("pendingAction",null);
    if(pending==null) return new JSONObject();
    JSONObject result=new JSONObject(pending);
    if(!state(c).user().equals(user) || !result.optString("userId").equals(user)) {
      prefs(c).edit().remove("pendingAction").apply(); return new JSONObject();
    }
    prefs(c).edit().remove("pendingAction").commit(); return result;
  }
  public static synchronized JSONObject status(Context c) throws Exception {
    BilooRideAlertState s=state(c); JSONObject active=s.active();
    if(active!=null && (active.optLong("deadline")<=System.currentTimeMillis() || active.optLong("elapsedDeadline")<=SystemClock.elapsedRealtime())) close(c,active.optString("id"),s.user());
    String id=channel(c,s);
    boolean enabled=true, headsUp=true, sound=s.sounds(), vibration=s.vibration();
    if(Build.VERSION.SDK_INT>=26) {
      NotificationChannel n=manager(c).getNotificationChannel(id);
      NotificationChannel parent=manager(c).getNotificationChannel(NexRideDriverAlertChannels.RIDE_REQUESTS);
      enabled=n!=null && n.getImportance()>0 && parent!=null && parent.getImportance()>0;
      headsUp=n!=null && n.getImportance()>=NotificationManager.IMPORTANCE_HIGH && parent!=null && parent.getImportance()>=NotificationManager.IMPORTANCE_HIGH;
      sound=s.sounds() && n!=null && n.getSound()!=null;
      vibration=s.vibration() && n!=null && n.shouldVibrate();
    }
    return s.metrics().put("protocol",1).put("enabled",s.enabled()).put("registered",!s.user().isEmpty() && s.user().equals(prefs(c).getString("registeredUser","")))
      .put("notificationsEnabled",NotificationManagerCompat.from(c).areNotificationsEnabled())
      .put("channelEnabled",enabled).put("headsUpEnabled",headsUp)
      .put("soundEnabled",sound).put("vibrationEnabled",vibration)
      .put("channelId",id).put("active",state(c).active()!=null);
  }
}
