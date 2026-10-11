// NexRide Android-only hardening of Capacitor 8 PushNotifications.
// Some Android 13+ devices crash in Capacitor's permission-state bridge.
// Keep the plugin API, Firebase delivery and token events unchanged,
// but avoid the fragile permission callback: open Android notifications
// settings when permission has not yet been granted.
// Guard synchronous Firebase exceptions so the process stays alive.
// The patch is applied to the ephemeral node_modules build copy only.
import fs from "node:fs";

const file = "node_modules/@capacitor/push-notifications/android/src/main/java/com/capacitorjs/plugins/pushnotifications/PushNotificationsPlugin.java";
let code = fs.readFileSync(file, "utf8");

const startMarker = "    @PluginMethod\n    public void checkPermissions(PluginCall call) {";
const endMarker = "    @PluginMethod\n    public void unregister(PluginCall call) {";
const start = code.indexOf(startMarker);
const end = code.indexOf(endMarker);
if (start < 0 || end <= start || !code.slice(start, end).includes("FirebaseMessaging.getInstance()")) {
  throw Error("Unexpected Capacitor PushNotifications Java API; stop rather than ship an unverified safety patch");
}
const safeMethods = `    // NexRide: use direct Android permission state, avoiding Capacitor's
    // bridge getPermissionStates() NPE seen on certain Android 13+ devices.
    private boolean nexRideAlertsEnabled() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            androidx.core.content.ContextCompat.checkSelfPermission(getContext(),
              Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        return androidx.core.app.NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        try {
            JSObject result = new JSObject();
            result.put("receive", nexRideAlertsEnabled() ? "granted" : "prompt");
            call.resolve(result);
        } catch (RuntimeException error) {
            call.reject("notification_permission_check_unavailable");
        }
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        try {
            if (nexRideAlertsEnabled()) {
                checkPermissions(call);
                return;
            }
            // User-initiated native settings is a stable Android fallback;
            // never call the buggy Capacitor requestPermissionForAlias path.
            Intent intent = new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            getActivity().startActivity(intent);
            JSObject result = new JSObject();
            result.put("receive", "prompt");
            call.resolve(result);
        } catch (RuntimeException error) {
            call.reject("notification_settings_unavailable");
        }
    }

    @PluginMethod
    public void register(PluginCall call) {
        try {
            FirebaseMessaging.getInstance().setAutoInitEnabled(true);
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (!task.isSuccessful() || task.getResult() == null) {
                    sendError("firebase_token_unavailable");
                    return;
                }
                sendToken(task.getResult());
            });
            call.resolve();
        } catch (RuntimeException error) {
            sendError("firebase_initialization_unavailable");
            call.reject("firebase_initialization_unavailable");
        }
    }

`;
code = code.slice(0, start) + safeMethods + code.slice(end);
const channelsStart = "    @PluginMethod\n    public void createChannel(PluginCall call) {";
const channelsOld = channelsStart + "\n        notificationChannelManager.createChannel(call);\n    }";
const channelsNew = channelsStart + "\n        try {\n            if (notificationChannelManager == null) { call.reject(\"notification_channel_unavailable\"); return; }\n            notificationChannelManager.createChannel(call);\n        } catch (RuntimeException error) {\n            call.reject(\"notification_channel_unavailable\");\n        }\n    }";
if (!code.includes(channelsOld)) {
  throw Error("Unexpected Capacitor PushNotifications channel API; stop build");
}
code = code.replace(channelsOld, channelsNew);
fs.writeFileSync(file, code);
console.log("NexRide Android push crash guard installed (native notification settings + safe FCM errors).");
