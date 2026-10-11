package com.nexride.APP_ROLE;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.regex.Pattern;

/**
 * NexRide Android Live Trip: confirmed trip milestones, never arbitrary % or ETA.
 * Android 16/API 36 uses platform ProgressStyle; older devices see a standard
 * persistent notification. Promoted status chip is OS-controlled (36.1+).
 * Does not replace Firebase ride alerts or the Driver foreground GPS service.
 */
@CapacitorPlugin(name = "NexRideLiveTrip")
public class NexRideLiveTripPlugin extends Plugin {
    private static final String CHANNEL = "nexride_active_trip_v1";
    private static final int NOTIFICATION_ID = 835210;
    private static final Pattern UUID = Pattern.compile(
        "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$");
    private static final String PREFS = "nexride_live_trip_v1";

    private boolean roleMatches(String role) {
        return ("driver".equals(role) || "rider".equals(role)) &&
            getContext().getPackageName().equals("com.nexride." + role);
    }
    private boolean notificationsAllowed() {
        return (Build.VERSION.SDK_INT < 33 ||
            getContext().checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)
            && manager().areNotificationsEnabled();
    }
    private NotificationManager manager() {
        return (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
    }
    private String savedTrip() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("tripId", "");
    }
    private void saveTrip(String id) {
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("tripId", id).apply();
    }
    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager m = manager();
        if (m.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL, "Live trip progress", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Ongoing NexRide ride stage and arrival progress");
        channel.setSound(null, null);
        channel.enableVibration(false);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        m.createNotificationChannel(channel);
    }
    @PluginMethod public void update(PluginCall call) {
        String role = call.getString("role", "");
        String id = call.getString("tripId", "");
        String stage = call.getString("stage", "");
        if (!roleMatches(role) || !UUID.matcher(id).matches()) {
            call.reject("invalid_native_trip_context"); return;
        }
        int step = stage.equals("accepted") || stage.equals("approaching") ? 0
            : stage.equals("arrived_pickup") || stage.equals("arrived") ? 1
            : stage.equals("in_trip") ? 2 : -1;
        if (step == -1) { call.reject("not_active_trip"); return; }
        try {
            if (!notificationsAllowed()) {
                JSObject result = new JSObject();
                result.put("status", "permission_required"); call.resolve(result); return;
            }
            ensureChannel();
            String lastId = savedTrip();
            if (!lastId.isEmpty() && !lastId.equals(id)) manager().cancel(NOTIFICATION_ID);
            String title = "NexRide · Active trip";
            String detail;
            if (step == 0) detail = role.equals("driver") ? "Navigate to pickup" : "Your driver is on the way";
            else if (step == 1) detail = role.equals("driver") ? "Driver at pickup" : "Your driver has arrived";
            else detail = role.equals("driver") ? "Driving to destination" : "Trip in progress";
            Integer eta = call.getInt("etaMinutes");
            // ETA is optional and comes only from fresh authoritative trip data.
            if (eta != null && eta > 0 && eta <= 120 && step == 0) detail += " · " + eta + " min ETA";
            detail += " · Stage " + (step + 1) + " of 3";

            Intent open = getContext().getPackageManager().getLaunchIntentForPackage(getContext().getPackageName());
            if (open == null) { call.reject("app_launch_unavailable"); return; }
            open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pending = PendingIntent.getActivity(getContext(), 721, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            Notification.Builder builder = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(getContext(), CHANNEL)
                : new Notification.Builder(getContext());
            builder.setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentTitle(title).setContentText(detail)
                .setSubText(role.equals("driver") ? "NexRide Driver" : "NexRide Rider")
                .setContentIntent(pending).setOnlyAlertOnce(true)
                .setCategory(Notification.CATEGORY_TRANSPORT)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOngoing(true).setAutoCancel(false)
                .setShowWhen(false).setColor(Color.rgb(0, 200, 120))
                .setLocalOnly(true);

            if (Build.VERSION.SDK_INT >= 36) {
                Notification.ProgressStyle progress = new Notification.ProgressStyle()
                    .addProgressSegment(new Notification.ProgressStyle.Segment(3)
                        .setColor(Color.rgb(0, 200, 120)))
                    // 0/3 = assigned, 1/3 = arrived, 2/3 = in trip;
                    // this is a discrete stage tracker, NOT % of the journey.
                    .setProgress(step);
                builder.setStyle(progress);
                // Platform promotion methods are 36.1+, not available in the
                // base API 36 SDK. Reflection is best-effort on compatible OS.
                try {
                    Method method = builder.getClass().getMethod("setRequestPromotedOngoing", boolean.class);
                    method.invoke(builder, true);
                    Method shortText = builder.getClass().getMethod("setShortCriticalText", CharSequence.class);
                    shortText.invoke(builder, step == 2 ? "On trip" : step == 1 ? "Arrived" : "En route");
                } catch (ReflectiveOperationException | RuntimeException ignored) {
                    // Android 16 base still shows ProgressStyle; older QPRs may not promote.
                }
            } else {
                builder.setProgress(3, step, false);
            }
            manager().notify(NOTIFICATION_ID, builder.build());
            saveTrip(id);
            JSObject result = new JSObject();
            result.put("status", Build.VERSION.SDK_INT >= 36 ? "android16_progress" : "standard_notification");
            call.resolve(result);
        } catch (SecurityException | IllegalArgumentException | IllegalStateException exception) {
            Log.w("NexRideLiveTrip", "Live trip notification not available", exception);
            call.reject("live_trip_notification_unavailable");
        } catch (RuntimeException exception) {
            Log.w("NexRideLiveTrip", "Native live trip notification failed", exception);
            call.reject("live_trip_notification_failed");
        }
    }
    @PluginMethod public void clear(PluginCall call) {
        String id = call.getString("tripId", "");
        try {
            // Empty ID is reserved for explicit sign-out cleanup only.
            if (!id.isEmpty() && !id.equals(savedTrip())) { call.resolve(); return; }
            manager().cancel(NOTIFICATION_ID);
            saveTrip("");
            call.resolve();
        } catch (RuntimeException e) { call.reject("notification_cleanup_failed"); }
    }
    @PluginMethod public void status(PluginCall call) {
        JSObject status = new JSObject();
        status.put("android16", Build.VERSION.SDK_INT >= 36);
        status.put("notificationsAllowed", notificationsAllowed());
        status.put("activeTrip", !savedTrip().isEmpty());
        call.resolve(status);
    }
}
