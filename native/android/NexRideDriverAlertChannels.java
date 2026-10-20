package com.nexride.driver;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

/**
 * Native Android 8+ channel for urgent incoming ride offers.
 * Android stores channel preferences after creation, so v2 intentionally
 * differs from the previous system-default ride requests channel.
 * Never overwrite a driver's custom notification sound/mute preferences.
 */
public final class NexRideDriverAlertChannels {
    public static final String RIDE_REQUESTS = "nexride_driver_requests_v2";

    private NexRideDriverAlertChannels() {}

    public static void ensure(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        try {
            NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null || manager.getNotificationChannel(RIDE_REQUESTS) != null) return;

            NotificationChannel channel = new NotificationChannel(
                RIDE_REQUESTS, "Incoming ride requests", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("New Biloo trips that need a quick response");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[] { 0, 220, 120, 220, 120, 420 });
            channel.setShowBadge(true);

            Uri tone = Uri.parse("android.resource://" + context.getPackageName()
                + "/" + R.raw.nexride_ride_request);
            AudioAttributes audio = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
            channel.setSound(tone, audio);
            manager.createNotificationChannel(channel);
        } catch (RuntimeException error) {
            // A disabled or faulty notification subsystem must not crash Driver.
            android.util.Log.w("NexRideAlerts", "Could not create ride notification channel", error);
        }
    }
}
