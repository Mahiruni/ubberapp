package com.nexride.driver;

import android.content.Context;
import android.content.Intent;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.util.AtomicFile;
import org.json.JSONObject;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import java.security.KeyStore;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileNotFoundException;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Android Keystore protects the rotated session; nothing sensitive enters logs or status(). */
public final class BilooDriverSessionStore {
  public static final String ORIGIN="https://eyyvvwecpyctttiueban.supabase.co";
  public static final ExecutorService WORKER=Executors.newSingleThreadExecutor();
  private static BilooDriverSession singleton;
  private static final String ALIAS="biloo.driver.session.v1";
  private BilooDriverSessionStore() {}
  public static synchronized BilooDriverSession get(Context context) {
    if(singleton!=null) return singleton;
    Context app=context.getApplicationContext();
    AtomicFile file=new AtomicFile(new File(app.getNoBackupFilesDir(),"biloo-driver-session.v1"));
    singleton=new BilooDriverSession(new BilooDriverSession.Vault() {
      private SecretKey key() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if(!store.containsAlias(ALIAS)) {
          KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
          generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).setUserAuthenticationRequired(false).build());
          generator.generateKey();
        }
        return (SecretKey)store.getKey(ALIAS,null);
      }
      public String read() throws Exception {
        InputStream recovered;
        try { recovered=file.openRead(); }
        catch(FileNotFoundException missing) { return null; }
        String value;
        try(InputStream input=recovered; ByteArrayOutputStream bytes=new ByteArrayOutputStream()) {
          byte[] buffer=new byte[4096]; int read;
          while((read=input.read(buffer))!=-1) {
            if(bytes.size()+read>1048576) throw new IllegalStateException("vault_too_large");
            bytes.write(buffer,0,read);
          }
          value=new String(bytes.toByteArray(),StandardCharsets.UTF_8);
        }
        String[] parts=value.split(":",2); if(parts.length!=2) throw new IllegalStateException("invalid_vault");
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),StandardCharsets.UTF_8);
      }
      public void write(String value) throws Exception {
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE,key());
        String encrypted=Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+":"+
          Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP);
        FileOutputStream output=file.startWrite();
        try { output.write(encrypted.getBytes(StandardCharsets.UTF_8)); file.finishWrite(output); }
        catch(Exception error) { file.failWrite(output); throw error; }
      }
      public void clear() throws Exception {
        file.delete();
        KeyStore store=KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if(store.containsAlias(ALIAS)) store.deleteEntry(ALIAS);
        if(file.getBaseFile().exists()) throw new IllegalStateException("vault_clear_failed");
      }
    }, token -> {
      String[] parts=token.split("\\."); if(parts.length!=3) throw new IllegalArgumentException("invalid_token");
      return new JSONObject(new String(Base64.decode(parts[1],Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING),StandardCharsets.UTF_8));
    }, System::currentTimeMillis, BilooDriverSessionStore::refresh, () -> {
      BilooDriverRideAlerts.clear(app,true);
      NexRideDriverLocationService.cancel(app,"session_required");
    });
    return singleton;
  }
  public static boolean publicConfiguration(String origin,String key) {
    if(!ORIGIN.equals(origin) || key==null || key.length()>4096) return false;
    if(key.startsWith("sb_publishable_") && key.length()>=24) return true;
    try {
      String[] parts=key.split("\\.");
      return parts.length==3 && "anon".equals(new JSONObject(new String(Base64.decode(parts[1],Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING),StandardCharsets.UTF_8)).optString("role"));
    }catch(Exception error){return false;}
  }
  private static BilooDriverSession.Reply refresh(String apiKey,String token) throws Exception {
    HttpURLConnection connection=(HttpURLConnection)new URL(ORIGIN+"/auth/v1/token?grant_type=refresh_token").openConnection();
    try {
      connection.setInstanceFollowRedirects(false); connection.setRequestMethod("POST");
      connection.setConnectTimeout(8000); connection.setReadTimeout(8000); connection.setDoOutput(true);
      connection.setRequestProperty("apikey",apiKey); connection.setRequestProperty("Content-Type","application/json");
      byte[] body=new JSONObject().put("refresh_token",token).toString().getBytes(StandardCharsets.UTF_8);
      try(java.io.OutputStream out=connection.getOutputStream()){out.write(body);}
      int status=connection.getResponseCode(); JSONObject result=null;
      if(status>=200 && status<300) {
        try(InputStream input=connection.getInputStream(); ByteArrayOutputStream bytes=new ByteArrayOutputStream()) {
          byte[] buffer=new byte[4096]; int read;
          while((read=input.read(buffer))!=-1) {
            if(bytes.size()+read>262144) throw new IllegalStateException("auth_response_too_large");
            bytes.write(buffer,0,read);
          }
          result=new JSONObject(new String(bytes.toByteArray(),StandardCharsets.UTF_8));
        }
      }
      return new BilooDriverSession.Reply(status,result);
    } finally { connection.disconnect(); }
  }
}
