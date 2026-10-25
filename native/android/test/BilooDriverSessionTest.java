package com.nexride.driver;

import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

public class BilooDriverSessionTest {
  private long now=1800000000000L;
  private String saved;
  private AtomicInteger calls,stops;
  private BilooDriverSession.Reply reply;
  private BilooDriverSession session;
  private Runnable duringRefresh;
  private final String key="sb_publishable_test_only";
  private String value(String user,String id,long expires,String refresh) throws Exception {
    JSONObject claims=new JSONObject().put("sub",user).put("session_id",id).put("exp",expires);
    String jwt="e30."+Base64.getUrlEncoder().withoutPadding().encodeToString(claims.toString().getBytes(StandardCharsets.UTF_8))+".test";
    return new JSONObject().put("access_token",jwt).put("refresh_token",refresh)
      .put("expires_at",expires).put("user",new JSONObject().put("id",user)).toString();
  }
  private String near() throws Exception { return value("driver-a","session-a",now/1000+60,"refresh-old"); }
  private String renewed() throws Exception { return value("driver-a","session-a",now/1000+3600,"refresh-new"); }
  @Before public void prepare() throws Exception {
    saved=null; calls=new AtomicInteger(); stops=new AtomicInteger(); duringRefresh=null;
    reply=new BilooDriverSession.Reply(200,new JSONObject(renewed()));
    session=new BilooDriverSession(new BilooDriverSession.Vault() {
      public String read(){return saved;}
      public void write(String value){saved=value;}
      public void clear(){saved=null;}
    }, token -> new JSONObject(new String(Base64.getUrlDecoder().decode(token.split("\\.")[1]),StandardCharsets.UTF_8)),
      () -> now,(apiKey,token) -> { calls.incrementAndGet(); if(duringRefresh!=null) duringRefresh.run(); return reply; },
      () -> stops.incrementAndGet());
  }
  @Test public void renewsWithoutWebViewAndReturnsRotatedTokenBeforeSdkReadsOldStorage() throws Exception {
    String old=near(); session.sync(old,true,key,session.epoch()); session.tracking=true;
    String fresh=session.sync(old,false,key,session.epoch());
    assertEquals("refresh-new",new JSONObject(fresh).getString("refresh_token"));
    assertEquals("refresh-new",new JSONObject(saved).getJSONObject("session").getString("refresh_token"));
    assertEquals(1,calls.get());
    assertEquals(1,session.refreshVersion());
    session.sync(old,false,key,session.epoch()); assertEquals(1,calls.get());
  }
  @Test public void doesNotRefreshOrTrackWhileOffline() throws Exception {
    session.sync(near(),true,key,session.epoch());
    session.fresh(true,session.epoch()); assertEquals(0,calls.get());
  }
  @Test public void authRevocationStopsGpsAndCannotRestoreOldBrowserCredentials() throws Exception {
    String old=near(); session.sync(old,true,key,session.epoch()); session.tracking=true;
    reply=new BilooDriverSession.Reply(401,null);
    assertNull(session.fresh(false,session.epoch())); assertFalse(session.tracking); assertEquals(1,stops.get());
    assertNull(session.sync(old,false,key,session.epoch()));
    assertFalse(saved.contains("refresh-old"));
  }
  @Test public void newSignInCanReplaceRevokedSessionWithoutRestoringOldIdentity() throws Exception {
    String old=near(); session.sync(old,true,key,session.epoch()); session.tracking=true;
    reply=new BilooDriverSession.Reply(400,null); session.fresh(false,session.epoch());
    String replacement=value("driver-a","new-session",now/1000+3600,"new-login");
    assertEquals("new-login",new JSONObject(session.sync(replacement,true,key,session.epoch())).getString("refresh_token"));
  }
  @Test public void temporaryOutageRetainsLatestRefreshTokenWithBoundedRetries() throws Exception {
    session.sync(near(),true,key,session.epoch()); session.tracking=true; reply=new BilooDriverSession.Reply(503,null);
    assertEquals("refresh-old",session.fresh(false,session.epoch()).getString("refresh_token"));
    session.fresh(false,session.epoch()); assertEquals(1,calls.get());
    assertEquals(0,session.refreshVersion());
    now+=5001; session.fresh(false,session.epoch()); assertEquals(2,calls.get());
    now+=120000; assertFalse(session.usable(session.fresh(false,session.epoch())));
  }
  @Test public void logoutDuringRefreshCannotWriteReturnedTokens() throws Exception {
    session.sync(near(),true,key,session.epoch()); session.tracking=true;
    duringRefresh=() -> { session.cancel(); try { session.clear(); } catch(Exception e) { throw new RuntimeException(e); } };
    assertNull(session.fresh(false,session.epoch())); assertNull(saved); assertFalse(session.tracking);
  }
  @Test public void networkRecoveryCanRetryImmediatelyWithoutDroppingTheSession() throws Exception {
    session.sync(near(),true,key,session.epoch()); session.tracking=true;
    reply=new BilooDriverSession.Reply(503,null); session.fresh(false,session.epoch());
    reply=new BilooDriverSession.Reply(200,new JSONObject(renewed())); session.retryNow();
    assertEquals("refresh-new",session.fresh(false,session.epoch()).getString("refresh_token"));
    assertEquals(2,calls.get()); assertEquals(1,session.refreshVersion());
  }
  @Test public void queuedReadsCannotResurrectSessionAfterLogout() throws Exception {
    String old=near(); session.sync(old,true,key,session.epoch()); long queued=session.epoch();
    session.cancel(); session.clear();
    assertNull(session.sync(old,false,key,queued)); assertNull(saved);
  }
  @Test public void accountSwitchStopsOldTrackingAndInvalidatesQueuedWork() throws Exception {
    String old=near(); session.sync(old,true,key,session.epoch()); session.tracking=true; long queued=session.epoch();
    String other=value("driver-b","session-b",now/1000+3600,"other-login");
    assertNotNull(session.sync(other,true,key,queued)); assertFalse(session.tracking); assertEquals(1,stops.get());
    assertNull(session.sync(old,false,key,queued)); assertTrue(saved.contains("other-login"));
  }
  @Test public void wrongRefreshSubjectOrSessionIsRejected() throws Exception {
    session.sync(near(),true,key,session.epoch()); session.tracking=true;
    reply=new BilooDriverSession.Reply(200,new JSONObject(value("driver-b","session-b",now/1000+3600,"wrong-user")));
    assertNull(session.fresh(false,session.epoch())); assertFalse(saved.contains("wrong-user")); assertFalse(session.tracking);
  }
  @Test public void newerSdkTokensArePreservedWithoutDiscardingNativeRotationOnReads() throws Exception {
    String initial=renewed(); session.sync(initial,true,key,session.epoch());
    String next=value("driver-a","session-a",now/1000+3600,"sdk-rotation");
    session.sync(next,true,key,session.epoch());
    assertEquals("sdk-rotation",new JSONObject(session.sync(initial,false,key,session.epoch())).getString("refresh_token"));
  }
}
