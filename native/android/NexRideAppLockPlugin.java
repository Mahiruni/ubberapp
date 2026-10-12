package com.nexride.APP_ROLE;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Deliberately no JS unlock, credential setter or disable method. */
@CapacitorPlugin(name = "NexRideAppLock")
public class NexRideAppLockPlugin extends Plugin {
    private NexRideAppLock controller() { return ((MainActivity) getActivity()).nexRideAppLock; }
    @PluginMethod public void status(PluginCall call) {
        getActivity().runOnUiThread(() -> call.resolve(JSObject.fromJSONObject(controller().status())));
    }
    @PluginMethod public void openSettings(PluginCall call) {
        String token = call.getString("accessToken", "");
        if (token.isEmpty()) { call.reject("sign_in_required"); return; }
        getActivity().runOnUiThread(() -> {
            controller().openSettings(token, call.getString("language", "en")); call.resolve();
        });
    }
    @PluginMethod public void lockNow(PluginCall call) {
        getActivity().runOnUiThread(() -> { controller().lockNow(); call.resolve(); });
    }
}
