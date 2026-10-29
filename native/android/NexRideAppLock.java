package com.nexride.APP_ROLE;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.text.InputType;
import android.util.Base64;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.net.ssl.HttpsURLConnection;

/** Native gate: created by MainActivity before the first frame, independent of JS.
 * App lock protects the UI; it never creates or restores a Supabase app session.
 * Existing background GPS, push and trip services remain running behind this gate.
 */
public final class NexRideAppLock {
    private static final String AUTH = "https://eyyvvwecpyctttiueban.supabase.co/auth/v1";
    private static final String API_KEY = "sb_publishable_kXFOrtwKkKmrqCtYTTuzdg__CjjABBf";
    private static final String STORE_KEY = "nexride_lock_store_v1", BIO_KEY = "nexride_lock_bio_v1";
    private final MainActivity activity;
    private final SharedPreferences prefs;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private JSONObject state;
    private FrameLayout cover;
    private LinearLayout panel;
    private TextView notice;
    private boolean locked, foreground = true, busy, damaged, settingsOpen;
    private long leftAt = -1, authorizedAt = -1;
    private int epoch;
    private String token = "", verifiedOwner = "";
    private BiometricPrompt biometric;
    private final Runnable countdown = new Runnable() {
        public void run() {
            if (!foreground || !locked || notice == null) return;
            long wait = retryRemaining();
            if (wait > 0) notice.setText(say("Try again in ", "እንደገና ይሞክሩ በ ") + ((wait + 999) / 1000) + say(" seconds", " ሰከንድ"));
            handler.postDelayed(this, 1000);
        }
    };

    public NexRideAppLock(MainActivity activity) {
        this.activity = activity;
        prefs = activity.getSharedPreferences("nexride_app_lock_v1", Context.MODE_PRIVATE);
        try { state = read(); } catch (Exception e) { damaged = true; state = new JSONObject(); }
        locked = enabled();
        if (locked) showLock();
        // This flag protects the native setup/password UI as well as the WebView.
        if (enabled()) activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        else activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
    }
    private String say(String en, String am) { return "am".equals(state.optString("language")) ? am : en; }
    private boolean enabled() { return damaged || state.optBoolean("enabled"); }
    public boolean consumesBack() { return locked || settingsOpen || cover != null; }
    public boolean blocksRideAction() { return locked || damaged || cover != null; }
    public void back() {
        epoch++;
        if (locked) { showLock(); return; }
        if (settingsOpen) closeSettings();
    }
    public void pause() {
        foreground = false; leftAt = SystemClock.elapsedRealtime(); epoch++;
        authorizedAt = -1; token = ""; verifiedOwner = "";
        if (biometric != null) biometric.cancelAuthentication();
        handler.removeCallbacks(countdown);
        settingsOpen = false;
        if (enabled()) screen(say("Biloo is protected", "Biloo የተጠበቀ ነው"));
        else hideCover();
    }
    public void resume() {
        foreground = true;
        if (enabled() && (locked || leftAt < 0 || SystemClock.elapsedRealtime() - leftAt >= state.optLong("timeout", 0))) {
            locked = true; showLock();
        } else hideCover();
        leftAt = -1;
    }
    public void destroy() {
        epoch++; handler.removeCallbacksAndMessages(null);
        if (biometric != null) biometric.cancelAuthentication();
        worker.shutdownNow();
    }
    public JSONObject status() {
        JSONObject out = new JSONObject();
        put(out, "enabled", enabled()); put(out, "method", state.optString("method", "pin"));
        put(out, "biometricAvailable", biometricAvailable()); put(out, "biometricEnabled", state.optBoolean("biometric"));
        put(out, "locked", locked); put(out, "timeout", state.optLong("timeout", 0));
        return out;
    }
    public void lockNow() { if (enabled()) { epoch++; authorizedAt = -1; token = ""; locked = true; showLock(); } }
    public void language(String value) {
        if ("en".equals(value) || "am".equals(value)) {
            put(state, "language", value);
            if (!damaged) save();
        }
    }
    public void openSettings(String accessToken, String language) {
        if (locked || damaged || busy) return;
        language(language);
        token = accessToken; settingsOpen = true;
        reauthenticate(false);
    }

    private void reauthenticate(boolean recovery) {
        screen(say(recovery ? "Recover app lock" : "Confirm your account", recovery ? "የመተግበሪያ ቁልፍ ያስመልሱ" : "መለያዎን ያረጋግጡ"));
        text(say("Enter your Biloo email and account password. They are verified securely and never saved on this device.",
            "የBiloo ኢሜይል እና የመለያ ይለፍ ቃል ያስገቡ። በዚህ መሣሪያ ላይ አይቀመጡም።"), 15);
        EditText email = input(say("Email", "ኢሜይል"), InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        EditText password = input(say("Account password", "የመለያ ይለፍ ቃል"), InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        Button submit = button(say("Verify account", "መለያ አረጋግጥ"), () -> {
            if (busy || retryRemaining() > 0) { cooldownMessage(); return; }
            final String address = email.getText().toString().trim();
            final String secret = password.getText().toString();
            password.setText("");
            if (address.length() > 254 || secret.length() < 6 || secret.length() > 512) { message(say("Check your account details.", "የመለያ ዝርዝሮችዎን ያረጋግጡ።")); return; }
            busy = true; final int attempt = epoch; final String bearer = token;
            message(say("Verifying…", "በማረጋገጥ ላይ…"));
            worker.execute(() -> {
                String owner = ""; int result = 503;
                JSONObject auth = null;
                try {
                    String expected = state.optString("owner");
                    if (!recovery) {
                        if (bearer.isEmpty()) throw new AuthError(401);
                        JSONObject current = request("/user", "GET", bearer, null);
                        String currentId = current.optString("id");
                        if (currentId.isEmpty() || (!expected.isEmpty() && !expected.equals(currentId))) throw new AuthError(401);
                        expected = currentId;
                    }
                    auth = request("/token?grant_type=password", "POST", "", new JSONObject().put("email", address).put("password", secret));
                    JSONObject user = auth.getJSONObject("user");
                    owner = user.optString("id");
                    if (expected.isEmpty() || !expected.equals(owner) || user.optString("email_confirmed_at").isEmpty() || user.isNull("email_confirmed_at")) throw new AuthError(401);
                    JSONArray factors = user.optJSONArray("factors");
                    if (factors != null) for (int i = 0; i < factors.length(); i++) {
                        if ("verified".equals(factors.getJSONObject(i).optString("status"))) throw new AuthError(409);
                    }
                    result = 200;
                } catch (AuthError e) { result = e.status; } catch (Exception ignored) { result = 503; }
                finally {
                    // Dispose of the ephemeral password-check session only, never the app session.
                    if (auth != null && !auth.optString("access_token").isEmpty()) {
                        try { request("/logout?scope=local", "POST", auth.optString("access_token"), new JSONObject()); } catch (Exception ignored) {}
                    }
                }
                final int status = result; final String confirmed = owner;
                activity.runOnUiThread(() -> {
                    busy = false;
                    if (attempt != epoch || !foreground) return;
                    if (status == 200) {
                        token = "";
                        resetAttempts(); verifiedOwner = confirmed; authorizedAt = SystemClock.elapsedRealtime();
                        if (recovery) {
                            settingsOpen = true;
                            // Recovery is a reset choice, never a login or automatic disable.
                            screen(say("Account verified", "መለያ ተረጋግጧል"));
                            button(say("Create a new PIN", "አዲስ PIN ይፍጠሩ"), () -> setup("pin"));
                            button(say("Create a new pattern", "አዲስ ንድፍ ይፍጠሩ"), () -> setup("pattern"));
                        } else settings();
                    } else {
                        if (status == 400 || status == 401) failAttempt();
                        message(status == 409 ? say("Additional account verification is required. Use the existing account recovery flow.", "ተጨማሪ የመለያ ማረጋገጫ ያስፈልጋል።") :
                            status == 429 ? say("Too many attempts. Try again later.", "ብዙ ሙከራዎች። በኋላ ይሞክሩ።") :
                            status == 400 || status == 401 ? say("Account verification failed.", "የመለያ ማረጋገጫ አልተሳካም።") :
                            say("Cannot verify now. Check your connection and try again.", "አሁን ማረጋገጥ አልተቻለም። ግንኙነትዎን ያረጋግጡ።"));
                    }
                });
            });
        });
        if (!recovery) button(say("Cancel", "ሰርዝ"), this::closeSettings);
        else button(say("Back to unlock", "ወደ መክፈቻ ተመለስ"), this::showLock);
        button(say("Forgot account password?", "የመለያ ይለፍ ቃል ረሱ?"), () -> {
            try { activity.startActivity(new android.content.Intent(android.content.Intent.ACTION_VIEW,
                android.net.Uri.parse("https://ubberapp.vercel.app/rider/forgot-password"))); }
            catch (RuntimeException ignored) { message(say("Open Biloo account recovery in your browser.", "የBiloo መለያ ማስመለሻን በአሳሽዎ ይክፈቱ።")); }
        });
    }
    private boolean authorized() {
        if (foreground && authorizedAt >= 0 && SystemClock.elapsedRealtime() - authorizedAt < 120_000 && !verifiedOwner.isEmpty()) return true;
        authorizedAt = -1; verifiedOwner = "";
        if (enabled()) { locked = true; showLock(); } else closeSettings();
        return false;
    }
    private void settings() {
        screen(say("App Lock", "የመተግበሪያ ቁልፍ"));
        text(say("Protect Biloo on this device.", "Bilooን በዚህ መሣሪያ ይጠብቁ።"), 16);
        text(enabled() ? say("Enabled · ", "በርቷል · ") + state.optString("method", "pin").toUpperCase() : say("App lock is off", "የመተግበሪያ ቁልፍ ጠፍቷል"), 16);
        button(say(enabled() ? "Change PIN" : "Set up six-digit PIN", "ባለ ስድስት አሃዝ PIN አዘጋጅ"), () -> setup("pin"));
        button(say(enabled() ? "Change pattern" : "Set up pattern lock", "የንድፍ ቁልፍ አዘጋጅ"), () -> setup("pattern"));
        if (enabled()) {
            if (biometricAvailable()) button(state.optBoolean("biometric") ? say("Disable biometric unlock", "የባዮሜትሪክ መክፈቻ አጥፋ") : say("Enable face / fingerprint unlock", "የፊት / የጣት አሻራ መክፈቻ አብራ"), () -> {
                if (!authorized()) return;
                if (state.optBoolean("biometric")) { clearBiometric(); save(); settings(); } else biometric(true);
            });
            else text(say("Strong face or fingerprint authentication is not available. Enroll a supported biometric in Android Settings.", "ጠንካራ የፊት ወይም የጣት አሻራ ማረጋገጫ አይገኝም። በAndroid ቅንብሮች ያዘጋጁ።"), 14);
            text(say("Automatically lock after leaving the app", "መተግበሪያውን ከወጡ በኋላ በራስ ሰር ቆልፍ"), 18);
            long[] durations = {0, 30_000, 60_000, 300_000};
            String[] labels = {say("Immediately", "ወዲያውኑ"), say("30 seconds", "30 ሰከንድ"), say("1 minute", "1 ደቂቃ"), say("5 minutes", "5 ደቂቃ")};
            for (int i = 0; i < durations.length; i++) {
                final long duration = durations[i];
                button((state.optLong("timeout") == duration ? "✓ " : "") + labels[i], () -> { if (authorized()) { put(state, "timeout", duration); save(); settings(); } });
            }
            if ("pattern".equals(state.optString("method"))) {
                CheckBox trail = check(say("Show pattern trail", "የንድፍ መስመር አሳይ"), state.optBoolean("trail", true));
                trail.setOnCheckedChangeListener((view, checked) -> { if (authorized()) { put(state, "trail", checked); save(); } });
                text(say("For an accessible keypad, choose PIN instead of pattern.", "ለቀላል መጠቀሚያ የPIN ቁልፍ ይምረጡ።"), 14);
            }
            button(say("Lock now", "አሁን ቆልፍ"), () -> { closeSettings(); lockNow(); });
            button(say("Disable App Lock", "የመተግበሪያ ቁልፍ አጥፋ"), () -> {
                if (!authorized()) return;
                screen(say("Disable App Lock?", "የመተግበሪያ ቁልፍ ይጥፋ?"));
                text(say("Anyone with access to this unlocked device can open Biloo.", "ይህን መሣሪያ የሚጠቀም ሰው Bilooን ሊከፍት ይችላል።"), 16);
                button(say("Confirm disable", "ማጥፋት አረጋግጥ"), () -> {
                    if (!authorized()) return;
                    String language = state.optString("language", "en"); clearBiometric();
                    state = new JSONObject(); put(state, "language", language); save(); locked = false; closeSettings();
                });
                button(say("Keep protected", "ጥበቃው ይቀጥል"), this::settings);
            });
        }
        text(say("Active rides and background GPS continue. While you remain in the foreground, Biloo stays unlocked; the selected lock timeout applies when you leave.",
            "ጉዞዎች እና GPS ይቀጥላሉ። መተግበሪያው በፊት ክፍት ሲሆን አይቆለፍም። ሲወጡ የተመረጠው ጊዜ ይተገበራል።"), 14);
        button(say("Done", "ተጠናቋል"), this::closeSettings);
    }
    private void closeSettings() {
        settingsOpen = false; authorizedAt = -1; token = ""; verifiedOwner = "";
        if (locked) showLock(); else hideCover();
        if (!enabled()) activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
    }
    private void setup(String method) {
        if (!authorized()) return;
        capture(method, false, null);
    }
    private void capture(String method, boolean confirmation, char[] first) {
        screen(say(confirmation ? "Confirm your lock" : "Create your lock", confirmation ? "ቁልፍዎን ያረጋግጡ" : "ቁልፍዎን ይፍጠሩ"));
        credential(method, entered -> {
            if (!authorized()) { Arrays.fill(entered, '\0'); if (first != null) Arrays.fill(first, '\0'); return; }
            String value = new String(entered);
            boolean valid = "pin".equals(method) ? NexRideLockRules.validPin(value) : value.length() >= 4;
            if (!valid) { Arrays.fill(entered, '\0'); message(say("Use six non-sequential digits, or at least four pattern dots.", "ስድስት ተከታታይ ያልሆኑ አሃዞች ወይም ቢያንስ አራት ነጥቦች ይጠቀሙ።")); return; }
            if (!confirmation) { capture(method, true, entered); return; }
            if (!Arrays.equals(first, entered)) { Arrays.fill(first, '\0'); Arrays.fill(entered, '\0'); capture(method, false, null); message(say("The entries did not match. Try again.", "ያስገቡት አልተዛመደም። እንደገና ይሞክሩ።")); return; }
            Arrays.fill(first, '\0'); busy = true; final int attempt = epoch;
            final String owner = verifiedOwner;
            message(say("Securing your lock…", "ቁልፍዎን በመጠበቅ ላይ…"));
            worker.execute(() -> {
                byte[] salt = new byte[32]; new SecureRandom().nextBytes(salt);
                byte[] hash = null;
                try { hash = derive(entered, salt); } catch (Exception ignored) {} finally { Arrays.fill(entered, '\0'); }
                final byte[] derived = hash;
                activity.runOnUiThread(() -> {
                    busy = false;
                    if (attempt != epoch || !authorized()) return;
                    if (derived == null) { message(say("Could not create the lock.", "ቁልፉን መፍጠር አልተቻለም።")); return; }
                    clearBiometric(); put(state, "owner", owner); put(state, "method", method);
                    put(state, "salt", b64(salt)); put(state, "verifier", b64(derived));
                    put(state, "enabled", true); put(state, "trail", true); resetAttempts();
                    if (save()) { locked = false; settings(); }
                });
            });
        });
        button(say("Cancel", "ሰርዝ"), () -> { if (first != null) Arrays.fill(first, '\0'); if (locked) showLock(); else settings(); });
    }
    private void showLock() {
        locked = true; settingsOpen = false; authorizedAt = -1; verifiedOwner = ""; token = "";
        handler.removeCallbacks(countdown);
        screen(say("Unlock Biloo", "Bilooን ይክፈቱ"));
        if (damaged) {
            text(say("Device security storage is unavailable. Your account is safe. Restore access by reinstalling Biloo and signing in again; local drafts will be lost.",
                "የመሣሪያ ደህንነት ማከማቻ አይገኝም። Bilooን እንደገና ይጫኑ እና ይግቡ። የአካባቢ ረቂቆች ይጠፋሉ።"), 16);
            return;
        }
        String method = state.optString("method", "pin");
        credential(method, this::verifyCredential);
        if (state.optBoolean("biometric") && biometricAvailable()) button(say("Use face / fingerprint", "ፊት / የጣት አሻራ ተጠቀም"), () -> biometric(false));
        button(say("Forgot PIN or pattern?", "PIN ወይም ንድፍ ረሱ?"), () -> reauthenticate(true));
        button(say("Emergency assistance", "የአደጋ እርዳታ"), () -> {
            try { activity.startActivity(new android.content.Intent(android.content.Intent.ACTION_DIAL)); }
            catch (RuntimeException ignored) { message(say("Use your phone’s emergency dialer.", "የስልክዎን የአደጋ ጥሪ ይጠቀሙ።")); }
        });
        text(say("App lock does not replace account sign-in. Emergency assistance: use your phone’s emergency dialer.",
            "የመተግበሪያ ቁልፍ የመለያ መግቢያን አይተካም። ለአደጋ የስልክዎን የአደጋ ጥሪ ይጠቀሙ።"), 13);
        handler.post(countdown); cooldownMessage();
    }
    private void verifyCredential(char[] entered) {
        if (busy || retryRemaining() > 0) { Arrays.fill(entered, '\0'); cooldownMessage(); return; }
        busy = true; final int attempt = epoch;
        worker.execute(() -> {
            boolean matches = false;
            try { matches = MessageDigest.isEqual(derive(entered, decode(state.optString("salt"))), decode(state.optString("verifier"))); }
            catch (Exception ignored) {} finally { Arrays.fill(entered, '\0'); }
            final boolean accepted = matches;
            activity.runOnUiThread(() -> {
                busy = false; if (attempt != epoch || !foreground) return;
                if (accepted) unlock(); else { failAttempt(); showLock(); message(say("Incorrect lock. Try again.", "የተሳሳተ ቁልፍ። እንደገና ይሞክሩ።")); cooldownMessage(); }
            });
        });
    }
    private void unlock() {
        resetAttempts(); if (!save()) return;
        locked = false; handler.removeCallbacks(countdown); hideCover();
    }
    private void credential(String method, Consumer<char[]> submit) {
        if ("pattern".equals(method)) {
            text(say("Draw your pattern · at least four dots", "ንድፍዎን ይሳሉ · ቢያንስ አራት ነጥቦች"), 16);
            PatternView pattern = new PatternView(submit);
            panel.addView(pattern, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(280)));
        } else {
            text(say("Enter your six-digit PIN", "ባለ ስድስት አሃዝ PIN ያስገቡ"), 16);
            EditText pin = input("PIN", InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
            pin.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(6)});
            pin.setShowSoftInputOnFocus(false);
            pin.setGravity(Gravity.CENTER); pin.setTextSize(28);
            for (int row = 0; row < 4; row++) {
                LinearLayout keys = new LinearLayout(activity); keys.setGravity(Gravity.CENTER);
                for (int col = 0; col < 3; col++) {
                    int index = row * 3 + col;
                    String label = index < 9 ? String.valueOf(index + 1) : index == 9 ? "⌫" : index == 10 ? "0" : "✓";
                    Button key = styledButton(label);
                    keys.addView(key, new LinearLayout.LayoutParams(0, dp(56), 1));
                    key.setContentDescription(index == 9 ? say("Delete digit", "አሃዝ ሰርዝ") : index == 11 ? say("Confirm PIN", "PIN አረጋግጥ") : label);
                    key.setOnClickListener(v -> {
                        if (busy) return;
                        String current = pin.getText().toString();
                        if (index == 9) pin.setText(current.isEmpty() ? "" : current.substring(0, current.length() - 1));
                        else if (index == 11) {
                            if (current.length() != 6) { message(say("Enter all six digits.", "ስድስቱንም አሃዞች ያስገቡ።")); return; }
                            pin.setText(""); submit.accept(current.toCharArray());
                        } else if (current.length() < 6) pin.setText(current + label);
                    });
                }
                panel.addView(keys);
            }
            pin.setOnEditorActionListener((v, action, event) -> {
                String value = pin.getText().toString();
                if (value.length() == 6) { pin.setText(""); submit.accept(value.toCharArray()); return true; }
                return false;
            });
        }
    }

    private boolean biometricAvailable() {
        return BiometricManager.from(activity).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS;
    }
    private void biometric(boolean enrolling) {
        if (busy || !foreground || !biometricAvailable() || (!enrolling && retryRemaining() > 0)) { cooldownMessage(); return; }
        if (enrolling && !authorized()) return;
        final int attempt = epoch;
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            if (enrolling) {
                clearBiometric();
                KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
                KeyGenParameterSpec.Builder spec = new KeyGenParameterSpec.Builder(BIO_KEY, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setUserAuthenticationRequired(true).setInvalidatedByBiometricEnrollment(true);
                if (android.os.Build.VERSION.SDK_INT >= 30) spec.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
                else spec.setUserAuthenticationValidityDurationSeconds(-1);
                generator.init(spec.build()); generator.generateKey();
                cipher.init(Cipher.ENCRYPT_MODE, key(BIO_KEY));
            } else cipher.init(Cipher.DECRYPT_MODE, key(BIO_KEY), new GCMParameterSpec(128, decode(state.optString("bioIv"))));
            busy = true;
            biometric = new BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), new BiometricPrompt.AuthenticationCallback() {
                @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                    busy = false; if (attempt != epoch || !foreground) return;
                    try {
                        if (result.getCryptoObject() == null || result.getCryptoObject().getCipher() == null) throw new IllegalStateException();
                        Cipher authenticated = result.getCryptoObject().getCipher();
                        byte[] marker = ("Biloo:" + state.optString("owner")).getBytes(StandardCharsets.UTF_8);
                        if (enrolling) {
                            if (!authorized()) return;
                            put(state, "bioData", b64(authenticated.doFinal(marker))); put(state, "bioIv", b64(authenticated.getIV()));
                            put(state, "biometric", true); if (save()) settings();
                        } else {
                            if (!MessageDigest.isEqual(marker, authenticated.doFinal(decode(state.optString("bioData"))))) throw new IllegalStateException();
                            unlock();
                        }
                    } catch (Exception e) { biometricUnavailable(); }
                }
                @Override public void onAuthenticationError(int code, CharSequence error) {
                    busy = false;
                    if (attempt != epoch || !foreground) return;
                    message(say("Biometric unlock was cancelled or is unavailable. Use your PIN or pattern.", "የባዮሜትሪክ መክፈቻ ተሰርዟል ወይም አይገኝም። PIN ወይም ንድፍ ይጠቀሙ።"));
                }
                @Override public void onAuthenticationFailed() {
                    message(say("Not recognized. Try again or use your PIN or pattern.", "አልታወቀም። እንደገና ይሞክሩ ወይም PIN ይጠቀሙ።"));
                }
            });
            biometric.authenticate(new BiometricPrompt.PromptInfo.Builder().setTitle(say("Unlock Biloo", "Bilooን ይክፈቱ"))
                .setSubtitle(say("Use an enrolled face or fingerprint", "የተመዘገበ ፊት ወይም የጣት አሻራ ይጠቀሙ"))
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                .setNegativeButtonText(say("Cancel", "ሰርዝ")).build(), new BiometricPrompt.CryptoObject(cipher));
        } catch (Exception e) { busy = false; biometricUnavailable(); }
    }
    private void biometricUnavailable() {
        clearBiometric(); save();
        message(say("Biometric protection changed. Use your PIN or pattern and enable biometrics again in App Lock settings.", "የባዮሜትሪክ ጥበቃ ተለውጧል። PIN ወይም ንድፍ ይጠቀሙ።"));
    }
    private void clearBiometric() {
        put(state, "biometric", false); state.remove("bioData"); state.remove("bioIv");
        try { KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null); ks.deleteEntry(BIO_KEY); } catch (Exception ignored) {}
    }
    private static byte[] derive(char[] secret, byte[] salt) throws Exception {
        PBEKeySpec spec = new PBEKeySpec(secret, salt, 600_000, 256);
        try { return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded(); }
        finally { spec.clearPassword(); }
    }
    private void resetAttempts() { put(state, "failures", 0); put(state, "delay", 0); }
    private void failAttempt() {
        int failures = Math.min(1000, state.optInt("failures") + 1);
        put(state, "failures", failures); put(state, "delay", NexRideLockRules.delayMillis(failures));
        put(state, "started", SystemClock.elapsedRealtime()); put(state, "boot", boot()); save();
    }
    private int boot() { return Settings.Global.getInt(activity.getContentResolver(), Settings.Global.BOOT_COUNT, -1); }
    private long retryRemaining() {
        long duration = state.optLong("delay"); if (duration <= 0) return 0;
        int boot = boot();
        if ((boot >= 0 && boot != state.optInt("boot", -2)) || SystemClock.elapsedRealtime() < state.optLong("started")) {
            put(state, "boot", boot); put(state, "started", SystemClock.elapsedRealtime()); save();
        }
        return NexRideLockRules.remaining(SystemClock.elapsedRealtime(), state.optLong("started"), duration);
    }
    private void cooldownMessage() { long wait = retryRemaining(); if (wait > 0) message(say("Try again in ", "እንደገና ይሞክሩ በ ") + ((wait + 999) / 1000) + say(" seconds", " ሰከንድ")); }
    private SecretKey key(String alias) throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null);
        if (!ks.containsAlias(alias)) {
            if (BIO_KEY.equals(alias)) throw new IllegalStateException("biometric_key_unavailable");
            KeyGenerator gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            gen.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            gen.generateKey();
        }
        return (SecretKey) ks.getKey(alias, null);
    }
    private JSONObject read() throws Exception {
        String data = prefs.getString("data", ""); if (data.isEmpty()) return new JSONObject();
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(STORE_KEY), new GCMParameterSpec(128, decode(prefs.getString("iv", ""))));
        return new JSONObject(new String(cipher.doFinal(decode(data)), StandardCharsets.UTF_8));
    }
    private boolean save() {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key(STORE_KEY));
            String data = b64(cipher.doFinal(state.toString().getBytes(StandardCharsets.UTF_8)));
            if (!prefs.edit().putString("data", data).putString("iv", b64(cipher.getIV())).commit()) throw new IllegalStateException();
            return true;
        } catch (Exception e) { damaged = true; locked = true; showLock(); return false; }
    }
    private static String b64(byte[] bytes) { return Base64.encodeToString(bytes, Base64.NO_WRAP); }
    private static byte[] decode(String value) { return Base64.decode(value, Base64.NO_WRAP); }
    private static void put(JSONObject object, String key, Object value) { try { object.put(key, value); } catch (Exception e) { throw new IllegalStateException(); } }
    private static final class AuthError extends Exception { final int status; AuthError(int status) { this.status = status; } }
    private JSONObject request(String path, String method, String bearer, JSONObject body) throws Exception {
        HttpsURLConnection connection = (HttpsURLConnection) new URL(AUTH + path).openConnection();
        connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(12_000); connection.setReadTimeout(12_000);
        connection.setRequestMethod(method); connection.setRequestProperty("apikey", API_KEY);
        connection.setRequestProperty("Content-Type", "application/json");
        if (!bearer.isEmpty()) connection.setRequestProperty("Authorization", "Bearer " + bearer);
        try {
            if (body != null) { connection.setDoOutput(true); try (java.io.OutputStream output = connection.getOutputStream()) { output.write(body.toString().getBytes(StandardCharsets.UTF_8)); } }
            int code = connection.getResponseCode(); if (code < 200 || code >= 300) throw new AuthError(code);
            try (InputStream input = connection.getInputStream(); java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096]; int count;
                while ((count = input.read(buffer)) != -1) {
                    if (output.size() + count > 131_072) throw new AuthError(503);
                    output.write(buffer, 0, count);
                }
                byte[] bytes = output.toByteArray();
                String result = new String(bytes, StandardCharsets.UTF_8); return result.isEmpty() ? new JSONObject() : new JSONObject(result);
            }
        } finally { connection.disconnect(); }
    }

    private int dp(int n) { return Math.round(n * activity.getResources().getDisplayMetrics().density); }
    private boolean dark() { return (activity.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES; }
    private int ink() { return dark() ? Color.WHITE : Color.rgb(32, 27, 72); }
    private void screen(String title) {
        activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        android.view.inputmethod.InputMethodManager keyboard = (android.view.inputmethod.InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE);
        if (activity.getCurrentFocus() != null) keyboard.hideSoftInputFromWindow(activity.getCurrentFocus().getWindowToken(), 0);
        hideCover();
        cover = new FrameLayout(activity); cover.setBackgroundColor(dark() ? Color.rgb(20, 17, 43) : Color.rgb(248, 247, 255));
        cover.setClickable(true); cover.setFocusable(true); cover.setFocusableInTouchMode(true);
        ScrollView scroll = new ScrollView(activity); scroll.setFillViewport(true);
        panel = new LinearLayout(activity); panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER_HORIZONTAL); panel.setPadding(dp(24), dp(32), dp(24), dp(32));
        scroll.addView(panel); cover.addView(scroll);
        ((ViewGroup) activity.getWindow().getDecorView()).addView(cover, new ViewGroup.LayoutParams(-1, -1));
        cover.setOnApplyWindowInsetsListener((view, insets) -> {
            panel.setPadding(dp(24), dp(32) + insets.getSystemWindowInsetTop(), dp(24), dp(32) + insets.getSystemWindowInsetBottom()); return insets;
        });
        cover.requestApplyInsets();
        text("Biloo", 28); TextView heading = text(title, 26); androidx.core.view.ViewCompat.setAccessibilityHeading(heading, true);
        notice = text("", 14); notice.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        cover.requestFocus();
        if (activity.getBridge() != null && activity.getBridge().getWebView() != null) activity.getBridge().getWebView().setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
    }
    private void hideCover() {
        if (cover != null) { ((ViewGroup) cover.getParent()).removeView(cover); cover = null; }
        notice = null;
        if (activity.getBridge() != null && activity.getBridge().getWebView() != null) activity.getBridge().getWebView().setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
    }
    private TextView text(String value, int size) {
        TextView view = new TextView(activity); view.setText(value); view.setTextColor(ink()); view.setTextSize(size);
        view.setGravity(Gravity.CENTER); view.setPadding(0, dp(8), 0, dp(8));
        panel.addView(view, new LinearLayout.LayoutParams(-1, -2)); return view;
    }
    private void message(String value) { if (notice != null) notice.setText(value); }
    private EditText input(String hint, int type) {
        EditText input = new EditText(activity); input.setHint(hint); input.setContentDescription(hint);
        input.setInputType(type); input.setTextColor(ink()); input.setHintTextColor(dark() ? Color.LTGRAY : Color.DKGRAY);
        if (android.os.Build.VERSION.SDK_INT >= 26) input.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);
        input.setSaveEnabled(false);
        input.setTextSize(18); input.setPadding(dp(12), dp(12), dp(12), dp(12));
        panel.addView(input, new LinearLayout.LayoutParams(-1, dp(60))); return input;
    }
    private Button styledButton(String title) {
        Button button = new Button(activity); button.setText(title); button.setAllCaps(false); button.setTextSize(16);
        button.setTextColor(Color.WHITE); button.setMinHeight(dp(48));
        GradientDrawable background = new GradientDrawable(); background.setColor(Color.rgb(81, 69, 229)); background.setCornerRadius(dp(16));
        button.setBackground(background); return button;
    }
    private Button button(String title, Runnable action) {
        Button button = styledButton(title);
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-1, -2); layout.setMargins(0, dp(8), 0, dp(4));
        panel.addView(button, layout); button.setOnClickListener(v -> { if (!busy) action.run(); }); return button;
    }
    private CheckBox check(String title, boolean checked) {
        CheckBox check = new CheckBox(activity); check.setText(title); check.setTextColor(ink()); check.setChecked(checked);
        panel.addView(check); return check;
    }
    private final class PatternView extends View {
        final List<Integer> dots = new ArrayList<>(); final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        final Consumer<char[]> submit; boolean drawing;
        PatternView(Consumer<char[]> submit) {
            super(activity); this.submit = submit;
            setContentDescription(say("Nine-dot pattern grid. For screen reader access choose PIN in App Lock settings.", "የዘጠኝ ነጥብ ንድፍ። ለማያ አንባቢ PIN ይምረጡ።"));
        }
        float x(int dot) { return getWidth() * (dot % 3 + 1) / 4f; }
        float y(int dot) { return getHeight() * (dot / 3 + 1) / 4f; }
        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas); boolean trail = state.optBoolean("trail", true) || settingsOpen;
            paint.setStrokeWidth(dp(4)); paint.setColor(Color.rgb(81, 69, 229));
            if (trail) for (int i = 1; i < dots.size(); i++) canvas.drawLine(x(dots.get(i - 1)), y(dots.get(i - 1)), x(dots.get(i)), y(dots.get(i)), paint);
            for (int i = 0; i < 9; i++) {
                paint.setColor(trail && dots.contains(i) ? Color.rgb(81, 69, 229) : dark() ? Color.LTGRAY : Color.GRAY);
                canvas.drawCircle(x(i), y(i), dp(10), paint);
            }
        }
        private void hit(float px, float py) {
            for (int i = 0; i < 9; i++) if (Math.hypot(px - x(i), py - y(i)) < dp(27)) {
                int before = dots.size(); NexRideLockRules.addDot(dots, i);
                if (dots.size() != before) performHapticFeedback(android.view.HapticFeedbackConstants.VIRTUAL_KEY);
            }
        }
        @Override public boolean onTouchEvent(MotionEvent event) {
            if (busy) return true;
            int action = event.getActionMasked();
            if (action == MotionEvent.ACTION_DOWN) { dots.clear(); drawing = true; getParent().requestDisallowInterceptTouchEvent(true); }
            if (drawing) { for (int i = 0; i < event.getHistorySize(); i++) hit(event.getHistoricalX(i), event.getHistoricalY(i)); hit(event.getX(), event.getY()); }
            if (action == MotionEvent.ACTION_UP) {
                drawing = false; getParent().requestDisallowInterceptTouchEvent(false); performClick();
                StringBuilder value = new StringBuilder(); for (int dot : dots) value.append(dot);
                dots.clear(); submit.accept(value.toString().toCharArray());
            } else if (action == MotionEvent.ACTION_CANCEL) { drawing = false; dots.clear(); getParent().requestDisallowInterceptTouchEvent(false); }
            invalidate(); return true;
        }
        @Override public boolean performClick() { super.performClick(); return true; }
    }
}
