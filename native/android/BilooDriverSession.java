package com.nexride.driver;

import org.json.JSONObject;
import java.util.concurrent.atomic.AtomicLong;

/** One durable token source for the WebView and foreground GPS service.
 * JWT claims here bind/cache sessions only; the server authorizes every GPS write.
 */
public final class BilooDriverSession {
  public interface Vault { String read() throws Exception; void write(String value) throws Exception; void clear() throws Exception; }
  public interface Decoder { JSONObject claims(String token) throws Exception; }
  public interface Clock { long millis(); }
  public interface Transport { Reply refresh(String apiKey, String refreshToken) throws Exception; }
  public static final class Reply {
    public final int status; public final JSONObject body;
    public Reply(int status, JSONObject body) { this.status=status; this.body=body; }
  }
  private final Vault vault; private final Decoder decoder; private final Clock clock;
  private final Transport transport; private final Runnable stopTracking;
  private final AtomicLong epoch=new AtomicLong();
  public volatile boolean tracking=false;
  private long retryAt=0; private int failures=0;
  private long refreshVersion=0;
  public long refreshVersion() { return refreshVersion; }
  public void retryNow() { retryAt=0; failures=0; }

  public BilooDriverSession(Vault vault, Decoder decoder, Clock clock, Transport transport, Runnable stopTracking) {
    this.vault=vault; this.decoder=decoder; this.clock=clock; this.transport=transport; this.stopTracking=stopTracking;
  }
  public long epoch() { return epoch.get(); }
  // Called immediately on logout, before any queued network work completes.
  public long cancel() { tracking=false; return epoch.incrementAndGet(); }
  public void clear() throws Exception { vault.clear(); retryAt=0; failures=0; }
  private JSONObject envelope() throws Exception {
    String value=vault.read(); return value==null ? new JSONObject() : new JSONObject(value);
  }
  private String binding(JSONObject session) throws Exception {
    JSONObject claims=decoder.claims(session.getString("access_token"));
    String user=claims.getString("sub"), id=claims.getString("session_id");
    if (user.isEmpty() || id.isEmpty() || !user.equals(session.getJSONObject("user").getString("id")) ||
        session.optString("refresh_token").isEmpty() || claims.getLong("exp")<=0) throw new IllegalArgumentException("invalid_session");
    session.put("expires_at", claims.getLong("exp"));
    return user+":"+id;
  }
  private void save(JSONObject value, long expected) throws Exception {
    if(epoch.get()==expected) vault.write(value.toString());
  }
  public String sync(String local, boolean writing, String apiKey, long expected) throws Exception {
    if(epoch.get()!=expected) return null;
    if(local==null) { cancel(); clear(); stopTracking.run(); return null; }
    JSONObject incoming=new JSONObject(local), stored=envelope();
    String incomingBinding=binding(incoming);
    if(incomingBinding.equals(stored.optString("revokedBinding"))) return null;
    JSONObject current=stored.optJSONObject("session");
    if(current!=null && !binding(current).equals(incomingBinding)) {
      expected=cancel(); stopTracking.run(); current=null;
    }
    if(current==null || incoming.getLong("expires_at")>current.getLong("expires_at") ||
        (writing && incoming.getLong("expires_at")==current.getLong("expires_at"))) {
      stored=new JSONObject().put("session",incoming).put("apiKey",apiKey);
      save(stored, expected);
    }
    JSONObject fresh=fresh(false, expected);
    return epoch.get()==expected && fresh!=null ? fresh.toString() : null;
  }
  public JSONObject fresh(boolean force, long expected) throws Exception {
    if(epoch.get()!=expected) return null;
    JSONObject stored=envelope(), current=stored.optJSONObject("session");
    if(current==null) return null;
    String before=binding(current);
    long now=clock.millis();
    if(!tracking || (!force && current.getLong("expires_at")*1000-now>120000) || now<retryAt) return current;
    try {
      Reply reply=transport.refresh(stored.getString("apiKey"),current.getString("refresh_token"));
      if(epoch.get()!=expected) return null;
      if(reply.status==400 || reply.status==401 || reply.status==403) { revoke(before,expected); return null; }
      if(reply.status<200 || reply.status>=300 || reply.body==null) throw new IllegalStateException("refresh_retry");
      JSONObject updated=reply.body;
      if(!before.equals(binding(updated)) || updated.getLong("expires_at")*1000<=now) {
        revoke(before,expected); return null;
      }
      save(new JSONObject().put("session",updated).put("apiKey",stored.getString("apiKey")),expected);
      if(epoch.get()!=expected) return null;
      refreshVersion++;
      failures=0; retryAt=0;
      return epoch.get()==expected ? updated : null;
    } catch(Exception error) {
      if(epoch.get()!=expected) return null;
      failures=Math.min(5,failures+1); retryAt=now+Math.min(60000,5000L*(1L<<(failures-1)));
      return current; // Keep the latest refresh token during a temporary outage.
    }
  }
  public void revoke(String sessionBinding, long expected) throws Exception {
    if(epoch.get()!=expected) return;
    tracking=false;
    try { save(new JSONObject().put("revokedBinding",sessionBinding),expected); }
    finally { stopTracking.run(); }
  }
  public void revokeCurrent(long expected) throws Exception {
    JSONObject session=envelope().optJSONObject("session");
    if(session!=null) revoke(binding(session),expected);
  }
  public boolean usable(JSONObject session) {
    return session!=null && session.optLong("expires_at")*1000>clock.millis();
  }
}
