package com.nexride.driver;

import org.json.JSONObject;
import java.util.Iterator;
import java.util.regex.Pattern;

/** Durable offer deadlines and tombstones; no Android process/timer is the authority. */
public final class BilooRideAlertState {
  public interface Store { String read(); void write(String value); }
  private static final Pattern UUID = Pattern.compile("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}");
  private final Store store;
  private JSONObject state;
  public BilooRideAlertState(Store store) {
    this.store=store;
    try { state=new JSONObject(store.read()); } catch(Exception error) { state=new JSONObject(); }
  }
  public static boolean validId(String value) { return value!=null && UUID.matcher(value).matches(); }
  private void save() { store.write(state.toString()); }
  public String user() { return state.optString("userId"); }
  public boolean enabled() { return state.optBoolean("enabled"); }
  public boolean sounds() { return state.optBoolean("sounds",true); }
  public boolean vibration() { return state.optBoolean("vibration",true); }
  public String language() { return state.optString("language","en"); }
  public JSONObject active() { return state.optJSONObject("active"); }
  private JSONObject seen() throws Exception {
    JSONObject seen=state.optJSONObject("seen");
    if(seen==null) { seen=new JSONObject(); state.put("seen",seen); }
    return seen;
  }
  private void remember(String id,long now) throws Exception {
    JSONObject seen=seen(); seen.put(id,now);
    Iterator<String> keys=seen.keys();
    while(keys.hasNext()) { String key=keys.next(); if(seen.optLong(key)<now-300000) keys.remove(); }
    while(seen.length()>64) {
      String oldest=null; long time=Long.MAX_VALUE;
      for(Iterator<String> i=seen.keys();i.hasNext();) { String key=i.next(); if(seen.optLong(key)<time) { time=seen.optLong(key); oldest=key; } }
      if(oldest==null) break; seen.remove(oldest);
    }
  }
  /** Return true when an account switch/offline transition must cancel the old notification. */
  public boolean configure(String user,boolean enabled,boolean sounds,boolean vibration,String language,long now) throws Exception {
    boolean changed=!user().equals(user), cancel=changed || !enabled;
    if(changed) state=new JSONObject();
    if(cancel && active()!=null) { remember(active().optString("id"),now); state.remove("active"); }
    state.put("userId",user).put("enabled",enabled).put("sounds",sounds).put("vibration",vibration)
      .put("language","am".equals(language)?"am":"en"); save(); return cancel;
  }
  /** A duplicate, older offer, revoked session, or closed offer never starts another ring. */
  public long receive(String id,String user,long expiresAt,long issuedAt,long now,long elapsed) throws Exception {
    if(!validId(id) || !enabled() || !user().equals(user) || expiresAt<=now || issuedAt<=0 || issuedAt>now+60000) return 0;
    if(seen().has(id) || issuedAt<state.optLong("latestIssuedAt")) return 0;
    long remaining=Math.min(30000,expiresAt-now);
    if(remaining<1) return 0;
    remember(id,now);
    state.put("latestIssuedAt",issuedAt).put("active",new JSONObject().put("id",id).put("userId",user)
      .put("deadline",now+remaining).put("elapsedDeadline",elapsed+remaining));
    state.put("received",state.optLong("received")+1).put("lastReceivedAt",now); save(); return remaining;
  }
  /** Record closure even if cancellation arrives before the incoming push. */
  public boolean close(String id,String user,long now) throws Exception {
    if(!validId(id) || !user().equals(user)) return false;
    remember(id,now);
    boolean current=active()!=null && id.equals(active().optString("id"));
    if(current) state.remove("active"); save(); return current;
  }
  public void clear(long now) throws Exception {
    if(active()!=null) remember(active().optString("id"),now);
    state.remove("active"); save();
  }
  public void displayed(long now) throws Exception { state.put("displayed",state.optLong("displayed")+1).put("lastDisplayedAt",now);save(); }
  public void opened() throws Exception { state.put("opened",state.optLong("opened")+1);save(); }
  public JSONObject metrics() throws Exception { return new JSONObject().put("received",state.optLong("received")).put("displayed",state.optLong("displayed")).put("opened",state.optLong("opened")).put("lastDisplayedAt",state.optLong("lastDisplayedAt")); }
}
