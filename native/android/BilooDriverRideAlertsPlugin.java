package com.nexride.driver;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.util.*;

@CapacitorPlugin(name="BilooDriverRideAlerts")
public final class BilooDriverRideAlertsPlugin extends Plugin {
  @Override public void load() { BilooDriverRideAlerts.captureIntent(getContext(),getActivity().getIntent()); }
  @Override protected void handleOnNewIntent(Intent intent) { BilooDriverRideAlerts.captureIntent(getContext(),intent); notifyListeners("rideAction",new JSObject()); }
  @PluginMethod public void configure(PluginCall call) {
    String user=call.getString("userId",""); boolean enabled=Boolean.TRUE.equals(call.getBoolean("enabled",false));
    BilooDriverSession session=BilooDriverSessionStore.get(getContext()); long epoch=session.epoch();
    BilooDriverSessionStore.WORKER.execute(() -> {
      try {
        JSONObject current=session.fresh(false,epoch);
        if(current==null || !current.getJSONObject("user").optString("id").equals(user) || session.epoch()!=epoch) {
          BilooDriverRideAlerts.clear(getContext(),true); call.reject("session_required"); return;
        }
        BilooDriverRideAlerts.configure(getContext(),user,enabled,Boolean.TRUE.equals(call.getBoolean("sounds",true)),
          Boolean.TRUE.equals(call.getBoolean("vibration",true)),call.getString("language","en"));
        call.resolve(new JSObject().put("protocol",1));
      } catch(Exception error) { call.reject("ride_alert_configuration_failed"); }
    });
  }
  @PluginMethod public void status(PluginCall call) {
    try { call.resolve(JSObject.fromJSONObject(BilooDriverRideAlerts.status(getContext()))); }
    catch(Exception error) { call.reject("ride_alert_status_unavailable"); }
  }
  @PluginMethod public void present(PluginCall call) {
    JSObject data=call.getObject("data"); Map<String,String> values=new HashMap<>();
    if(data!=null) for(Iterator<String> i=data.keys();i.hasNext();) { String key=i.next(); values.put(key,data.optString(key)); }
    boolean shown=BilooDriverRideAlerts.show(getContext(),values,false);
    call.resolve(new JSObject().put("owned",true).put("displayed",shown));
  }
  @PluginMethod public void stop(PluginCall call) {
    String id=call.getString("offerId");
    if(id==null) BilooDriverRideAlerts.clear(getContext(),false);
    else BilooDriverRideAlerts.closeCurrent(getContext(),id);
    call.resolve();
  }
  @PluginMethod public void disable(PluginCall call) { BilooDriverRideAlerts.clear(getContext(),true); call.resolve(); }
  @PluginMethod public void registered(PluginCall call) {
    BilooDriverRideAlerts.registered(getContext(),call.getString("userId","")); call.resolve();
  }
  @PluginMethod public void consumeAction(PluginCall call) {
    android.app.KeyguardManager keyguard=(android.app.KeyguardManager)getContext().getSystemService(android.content.Context.KEYGUARD_SERVICE);
    MainActivity activity=(MainActivity)getActivity();
    if(keyguard.isKeyguardLocked() || !activity.getLifecycle().getCurrentState().isAtLeast(androidx.lifecycle.Lifecycle.State.RESUMED) ||
       (activity.nexRideAppLock!=null && activity.nexRideAppLock.blocksRideAction())) {
      call.resolve(new JSObject().put("waitingForUnlock",true)); return;
    }
    try { call.resolve(JSObject.fromJSONObject(BilooDriverRideAlerts.consumeAction(getContext(),call.getString("userId","")))); }
    catch(Exception error) { call.reject("ride_alert_action_unavailable"); }
  }
  @PluginMethod public void test(PluginCall call) {
    Map<String,String> data=new HashMap<>(); data.put("offerId",UUID.randomUUID().toString()); data.put("userId","");
    data.put("pickup","BILOO · test notification"); data.put("detail","Test only · stops automatically in 5 seconds");
    boolean shown=BilooDriverRideAlerts.show(getContext(),data,true);
    call.resolve(new JSObject().put("displayed",shown));
  }
  @PluginMethod public void openSettings(PluginCall call) {
    try {
      Intent intent;
      if(Build.VERSION.SDK_INT>=26 && !"battery".equals(call.getString("section"))) {
        intent=new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
          .putExtra(Settings.EXTRA_APP_PACKAGE,getContext().getPackageName())
          .putExtra(Settings.EXTRA_CHANNEL_ID,BilooDriverRideAlerts.status(getContext()).getString("channelId"));
      } else intent=new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getContext().getPackageName()));
      getActivity().startActivity(intent); call.resolve();
    } catch(Exception error) { call.reject("ride_alert_settings_unavailable"); }
  }
}
