package com.nexride.driver;
import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.app.Activity;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
@CapacitorPlugin(name="NexRideDriverLocation")
public class NexRideDriverLocationPlugin extends Plugin {
  @PluginMethod public void start(PluginCall call){
    String token=call.getString("accessToken","");
    if(token.length()<20){call.reject("session_required");return;}
    Activity activity=getActivity();
    if(activity.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED &&
      activity.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED){
      call.reject("location_permission_required");return;
    }
    try{
      Intent i=new Intent(activity,NexRideDriverLocationService.class);
      i.setAction(NexRideDriverLocationService.START);
      i.putExtra(NexRideDriverLocationService.TOKEN,token);
      if(Build.VERSION.SDK_INT>=26)activity.startForegroundService(i);else activity.startService(i);
      JSObject result=new JSObject();result.put("status","started");call.resolve(result);
    }catch(SecurityException|IllegalStateException e){call.reject("foreground_service_not_permitted");}
  }
  @PluginMethod public void stop(PluginCall call){
    getActivity().stopService(new Intent(getActivity(),NexRideDriverLocationService.class));call.resolve();
  }
  @PluginMethod public void status(PluginCall call){
    JSObject result=new JSObject();result.put("running",NexRideDriverLocationService.isRunning());call.resolve(result);
  }
}
