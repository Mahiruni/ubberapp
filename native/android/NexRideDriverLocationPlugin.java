package com.nexride.driver;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import androidx.lifecycle.Lifecycle;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name="NexRideDriverLocation")
public class NexRideDriverLocationPlugin extends Plugin {
  @PluginMethod public void resolveSession(PluginCall call) {
    String origin=call.getString("origin",""), key=call.getString("publishableKey","");
    if(!BilooDriverSessionStore.publicConfiguration(origin,key)) { call.reject("untrusted_auth_configuration"); return; }
    BilooDriverSession session=BilooDriverSessionStore.get(getContext());
    String local=call.getString("session");
    if(local==null) { clearSession(call); return; }
    long epoch=session.epoch(); boolean writing=Boolean.TRUE.equals(call.getBoolean("writing",false));
    BilooDriverSessionStore.WORKER.execute(() -> {
      try {
        String value=session.sync(local,writing,key,epoch);
        JSObject result=new JSObject(); result.put("session",value==null ? JSONObject.NULL : value); call.resolve(result);
      } catch(Exception error) {
        session.cancel(); NexRideDriverLocationService.cancel(getContext(),"session_required");
        try { session.clear(); } catch(Exception ignored) {}
        call.reject("native_session_unavailable");
      }
    });
  }
  @PluginMethod public void clearSession(PluginCall call) {
    BilooDriverRideAlerts.clear(getContext(),true);
    BilooDriverSession session=BilooDriverSessionStore.get(getContext());
    session.cancel(); NexRideDriverLocationService.cancel(getContext(),"signed_out");
    BilooDriverSessionStore.WORKER.execute(() -> {
      try { session.clear(); JSObject result=new JSObject(); result.put("session",JSONObject.NULL); call.resolve(result); }
      catch(Exception error) { call.reject("native_session_unavailable"); }
    });
  }
  @PluginMethod public void start(PluginCall call) {
    Activity activity=getActivity();
    if(activity.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED &&
       activity.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED) {
      call.reject("location_permission_required"); return;
    }
    LocationManager providers=(LocationManager)getContext().getSystemService(android.content.Context.LOCATION_SERVICE);
    if(providers==null || (!providers.isProviderEnabled(LocationManager.GPS_PROVIDER) && !providers.isProviderEnabled(LocationManager.NETWORK_PROVIDER))) {
      call.reject("location_services_disabled"); return;
    }
    BilooDriverSession session=BilooDriverSessionStore.get(getContext()); long epoch=session.epoch();
    BilooDriverSessionStore.WORKER.execute(() -> {
      try {
        JSONObject current=session.fresh(false,epoch);
        if(!session.usable(current) || !current.getJSONObject("user").getString("id").equals(call.getString("userId",""))) {
          call.reject("session_required"); return;
        }
        activity.runOnUiThread(() -> {
          if(session.epoch()!=epoch) { call.reject("session_required"); return; }
          if(NexRideDriverLocationService.isRunning()) { JSObject result=new JSObject(); result.put("status","started"); call.resolve(result); return; }
          if(!getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED)) {
            call.reject("foreground_required"); return;
          }
          Handler handler=new Handler(Looper.getMainLooper()); AtomicBoolean finished=new AtomicBoolean();
          Runnable timeout=() -> { if(finished.compareAndSet(false,true)) call.reject("tracking_start_timeout"); };
          ResultReceiver receiver=new ResultReceiver(handler) {
            @Override protected void onReceiveResult(int code,Bundle data) {
              if(!finished.compareAndSet(false,true)) return;
              handler.removeCallbacks(timeout);
              if(code!=1) call.reject(data.getString("status","tracking_unavailable"));
              else { JSObject result=new JSObject(); result.put("status","started"); call.resolve(result); }
            }
          };
          try {
            Intent intent=new Intent(activity,NexRideDriverLocationService.class).setAction(NexRideDriverLocationService.START);
            intent.putExtra(NexRideDriverLocationService.EPOCH,epoch); intent.putExtra(NexRideDriverLocationService.RECEIVER,receiver);
            handler.postDelayed(timeout,5000);
            if(Build.VERSION.SDK_INT>=26) activity.startForegroundService(intent); else activity.startService(intent);
          } catch(RuntimeException error) {
            handler.removeCallbacks(timeout); if(finished.compareAndSet(false,true)) call.reject("foreground_service_not_permitted");
          }
        });
      } catch(Exception error) { call.reject("session_required"); }
    });
  }
  @PluginMethod public void stop(PluginCall call) { NexRideDriverLocationService.cancel(getContext(),"stopped"); call.resolve(); }
  @PluginMethod public void status(PluginCall call) {
    LocationManager location=(LocationManager)getContext().getSystemService(android.content.Context.LOCATION_SERVICE);
    PowerManager power=(PowerManager)getContext().getSystemService(android.content.Context.POWER_SERVICE);
    JSObject result=new JSObject(); result.put("running",NexRideDriverLocationService.isRunning());
    result.put("state",NexRideDriverLocationService.state());
    result.put("tripTracking",true);
    result.put("lastFixAt",NexRideDriverLocationService.lastFixAt()); result.put("lastUploadAt",NexRideDriverLocationService.lastUploadAt());
    result.put("batteryExempt",power.isIgnoringBatteryOptimizations(getContext().getPackageName()));
    result.put("locationEnabled",location.isProviderEnabled(LocationManager.GPS_PROVIDER)||location.isProviderEnabled(LocationManager.NETWORK_PROVIDER));
    call.resolve(result);
  }
  @PluginMethod public void openLocationSettings(PluginCall call) {
    Activity activity=getActivity();
    if(activity==null) { call.reject("activity_unavailable"); return; }
    try {
      activity.startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS));
      call.resolve();
    } catch(Exception error) { call.reject("location_settings_unavailable"); }
  }
  @PluginMethod public void openSettings(PluginCall call) {
    Intent intent=new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getContext().getPackageName()));
    getActivity().startActivity(intent); call.resolve();
  }
}
