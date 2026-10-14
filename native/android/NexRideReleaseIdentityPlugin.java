package com.nexride.APP_ROLE;

import android.content.pm.PackageInfo;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Only newly built native wrappers register this plugin. Original APKs do not,
 * so they receive the update-required screen from the current web application.
 * Not a cryptographic device attestation mechanism.
 */
@CapacitorPlugin(name = "NexRideReleaseIdentity")
public class NexRideReleaseIdentityPlugin extends Plugin {
    @PluginMethod
    public void getReleaseIdentity(PluginCall call) {
        try {
            String packageName = getContext().getPackageName();
            PackageInfo packageInfo = getContext().getPackageManager().getPackageInfo(packageName, 0);
            long versionCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                    ? packageInfo.getLongVersionCode() : packageInfo.versionCode;
            JSObject result = new JSObject();
            result.put("releaseId", "nexride-2026-10-14-02");
            result.put("versionCode", versionCode);
            result.put("packageName", packageName);
            result.put("role", "APP_ROLE");
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Android release identity unavailable", e);
        }
    }
}
