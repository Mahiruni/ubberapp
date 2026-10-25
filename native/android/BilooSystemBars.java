package com.nexride.APP_ROLE;

import android.app.Activity;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;

/** Biloo native system chrome. Never enter immersive/fullscreen mode. */
public final class BilooSystemBars {
  private BilooSystemBars() {}

  public static void apply(Activity activity) {
    Window window = activity.getWindow();
    window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
    window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
    window.setStatusBarColor(android.graphics.Color.rgb(8, 41, 95));
    window.setNavigationBarColor(android.graphics.Color.rgb(8, 41, 95));
    View decor = window.getDecorView();
    int flags = decor.getSystemUiVisibility();
    flags &= ~View.SYSTEM_UI_FLAG_FULLSCREEN;
    flags &= ~View.SYSTEM_UI_FLAG_HIDE_NAVIGATION;
    flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
    decor.setSystemUiVisibility(flags);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.setStatusBarContrastEnforced(false);
      window.setNavigationBarContrastEnforced(false);
    }
    // On Android 15+ the OS enforces edge-to-edge. CSS viewport safe areas
    // remain responsible for positioning Biloo's interactive map controls.
    window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
  }
}
