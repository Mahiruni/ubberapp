package com.nexride.driver;

import com.google.firebase.messaging.RemoteMessage;

/** Native data messages are delivered without a WebView or running Activity. */
public final class BilooDriverMessagingService extends com.capacitorjs.plugins.pushnotifications.MessagingService {
  @Override public void onNewToken(String token) {
    BilooDriverRideAlerts.tokenChanged(this);
    super.onNewToken(token); // Active bridge uploads it; resume reconciles a dormant WebView.
  }
  @Override public void onMessageReceived(RemoteMessage message) {
    java.util.Map<String,String> data=message.getData();
    if("1".equals(data.get("alertProtocol")) &&
       ("driver_offer".equals(data.get("kind")) || "driver_offer_closed".equals(data.get("kind")))) {
      if("driver_offer_closed".equals(data.get("kind")))
        BilooDriverRideAlerts.close(this,data.get("offerId"),data.get("userId"));
      else BilooDriverRideAlerts.show(this,data,false);
      return; // Never let the Capacitor plugin create a second notification.
    }
    super.onMessageReceived(message);
  }
}
