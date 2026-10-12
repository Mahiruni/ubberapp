package com.nexride.driver;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.app.Activity;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Starts from the visible Driver activity; never requests background-only FGS starts. */
@CapacitorPlugin(name="NexRideDriverLocation")
public class NexRideDriverLocationPlugin extends Plugin {
  @PluginMethod public void start(PluginCall call){
    if(!getContext().getPackageName().equals("com.nexride.driver")){
      call.reject("driver_app_required"); return;
    }
    String token=call.getString("accessToken","");
    String refresh=call.getString("refreshToken","");
    String authUrl=call.getString("authUrl","");
    String key=call.getString("publishableKey","");
    if(token.length()<20 || refresh.length()<20 || key.length()<20 ||
       !authUrl.matches("https://[a-z0-9-]+\\.supabase\\.co")){
      call.reject("session_required"); return;
    }
    Activity activity=getActivity();
    if(activity==null || activity.isFinishing()){
      call.reject("visible_driver_activity_required");return;
    }
    if(activity.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED &&
       activity.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED){
      call.reject("location_permission_required");return;
    }
    try{
      Intent start=new Intent(activity,NexRideDriverLocationService.class);
      start.setAction(NexRideDriverLocationService.START);
      start.putExtra(NexRideDriverLocationService.TOKEN,token);
      start.putExtra(NexRideDriverLocationService.REFRESH,refresh);
      start.putExtra(NexRideDriverLocationService.AUTH_URL,authUrl);
      start.putExtra(NexRideDriverLocationService.API_KEY,key);
      if(Build.VERSION.SDK_INT>=26)activity.startForegroundService(start);
      else activity.startService(start);
      JSObject result=new JSObject(); result.put("status","started");call.resolve(result);
    }catch(SecurityException|IllegalStateException e){call.reject("foreground_service_not_permitted");}
  }

  @PluginMethod public void stop(PluginCall call){
    getContext().stopService(new Intent(getContext(),NexRideDriverLocationService.class));
    call.resolve();
  }

  @PluginMethod public void status(PluginCall call){
    NexRideDriverLocationService service=NexRideDriverLocationService.current();
    JSObject result=new JSObject();
    result.put("running",service!=null && service.isActive());
    result.put("lastServerAckAt",service!=null?service.getLastServerAckAt():0);
    result.put("lastGpsFixAt",service!=null?service.getLastGoodFixAt():0);
    result.put("accuracyMeters",service!=null && !Float.isNaN(service.getLastAccuracy()) && !Float.isInfinite(service.getLastAccuracy())
      ? service.getLastAccuracy():JSONObjectNull());
    result.put("error",service!=null?service.getLastError():"stopped");
    call.resolve(result);
  }

  private static Object JSONObjectNull(){ return org.json.JSONObject.NULL; }

  // Only the same authenticated Driver WebView can request an in-memory rotated
  // session; never persist refresh credentials in Android preferences/logs.
  @PluginMethod public void session(PluginCall call){
    NexRideDriverLocationService service=NexRideDriverLocationService.current();
    if(service==null || !service.isActive()){
      call.resolve(new JSObject());return;
    }
    JSObject response=new JSObject();
    response.put("accessToken",service.getAccessToken());
    response.put("refreshToken",service.getRefreshToken());
    call.resolve(response);
  }
}
