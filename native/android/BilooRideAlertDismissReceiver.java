package com.nexride.driver;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Dismissing an alert silences this offer; it never secretly declines a booking. */
public final class BilooRideAlertDismissReceiver extends BroadcastReceiver {
  @Override public void onReceive(Context context,Intent intent) {
    BilooDriverRideAlerts.close(context,intent.getStringExtra("offerId"),intent.getStringExtra("userId"));
  }
}
