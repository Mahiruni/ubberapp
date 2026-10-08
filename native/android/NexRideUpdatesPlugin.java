package com.nexride.updates;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.IntentSender;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.UpdateAvailability;

/** Native Google Play immediate update; does not bypass Android install consent. */
@CapacitorPlugin(name = "NexRideUpdates")
public class NexRideUpdatesPlugin extends Plugin {
  @PluginMethod
  public void startImmediateUpdate(PluginCall call) {
    final AppUpdateManager manager = AppUpdateManagerFactory.create(getContext());
    manager.getAppUpdateInfo()
      .addOnSuccessListener(info -> {
        if (info.updateAvailability() != UpdateAvailability.UPDATE_AVAILABLE
            || !info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)) {
          call.reject("PLAY_UPDATE_NOT_AVAILABLE");
          return;
        }
        try {
          boolean started = manager.startUpdateFlowForResult(
              info, getActivity(),
              AppUpdateOptions.newBuilder(AppUpdateType.IMMEDIATE).build(),
              31041
          );
          if (!started) { call.reject("PLAY_UPDATE_NOT_STARTED"); return; }
          JSObject result = new JSObject();
          result.put("started", true);
          call.resolve(result);
        } catch (IntentSender.SendIntentException exception) {
          call.reject("PLAY_UPDATE_START_FAILED", exception);
        }
      })
      .addOnFailureListener(error -> call.reject("PLAY_UPDATE_UNAVAILABLE", error));
  }

  @PluginMethod
  public void openStore(PluginCall call) {
    String appId = getContext().getPackageName();
    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + appId));
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    intent.setPackage("com.android.vending");
    try {
      getActivity().startActivity(intent);
    } catch (ActivityNotFoundException missingPlay) {
      Intent web = new Intent(Intent.ACTION_VIEW,
          Uri.parse("https://play.google.com/store/apps/details?id=" + appId));
      web.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getActivity().startActivity(web);
    }
    call.resolve();
  }
}
