package com.nexride.driver;

import org.junit.Test;
import static org.junit.Assert.*;
import org.json.JSONObject;

public class BilooRideAlertStateTest {
  private static final String USER="11111111-1111-4111-8111-111111111111", OTHER="22222222-2222-4222-8222-222222222222";
  private static final String A="33333333-3333-4333-8333-333333333333", B="44444444-4444-4444-8444-444444444444";
  private static final long NOW=1800000000000L;
  private static class Memory implements BilooRideAlertState.Store { String value="{}";public String read(){return value;}public void write(String value){this.value=value;} }
  private BilooRideAlertState ready(Memory memory) throws Exception { BilooRideAlertState s=new BilooRideAlertState(memory);s.configure(USER,true,true,true,"en",NOW);return s; }
  @Test public void capsTheRingAndPersistsTheOriginalDeadlineAcrossProcessDeath() throws Exception {
    Memory memory=new Memory(); BilooRideAlertState s=ready(memory);
    assertEquals(30000,s.receive(A,USER,NOW+120000,NOW,NOW,500));
    BilooRideAlertState restored=new BilooRideAlertState(memory);
    assertEquals(NOW+30000,restored.active().getLong("deadline"));
    assertEquals(30500,restored.active().getLong("elapsedDeadline"));
    assertEquals(0,restored.receive(A,USER,NOW+120000,NOW,NOW+5000,5500));
    assertEquals(NOW+30000,restored.active().getLong("deadline"));
  }
  @Test public void aDelayedMessageOnlyGetsTheRemainingServerLifetime() throws Exception {
    BilooRideAlertState s=ready(new Memory());
    assertEquals(4000,s.receive(A,USER,NOW+4000,NOW-26000,NOW,100));
    assertEquals(0,s.receive(B,USER,NOW-1,NOW,NOW,100));
  }
  @Test public void cancellationBeforeIncomingSurvivesARestart() throws Exception {
    Memory memory=new Memory(); BilooRideAlertState s=ready(memory);
    assertFalse(s.close(A,USER,NOW));
    assertEquals(0,new BilooRideAlertState(memory).receive(A,USER,NOW+30000,NOW,NOW,100));
  }
  @Test public void anOldCancellationCannotSilenceANewerRequest() throws Exception {
    BilooRideAlertState s=ready(new Memory());
    s.receive(A,USER,NOW+30000,NOW,NOW,100);
    s.receive(B,USER,NOW+30000,NOW+1,NOW+1,101);
    assertFalse(s.close(A,USER,NOW+2)); assertEquals(B,s.active().getString("id"));
    assertTrue(s.close(B,USER,NOW+3)); assertNull(s.active());
  }
  @Test public void rejectsWrongAccountsOfflineDriversMalformedIdsAndOldMessages() throws Exception {
    BilooRideAlertState s=ready(new Memory());
    assertEquals(0,s.receive(A,OTHER,NOW+30000,NOW,NOW,100));
    assertEquals(0,s.receive("1-1-1-1-1",USER,NOW+30000,NOW,NOW,100));
    s.receive(A,USER,NOW+30000,NOW,NOW,100);
    assertEquals(0,s.receive(B,USER,NOW+30000,NOW-1,NOW,100));
    assertTrue(s.configure(USER,false,true,true,"en",NOW+1)); assertNull(s.active());
    assertEquals(0,s.receive(B,USER,NOW+30000,NOW,NOW,100));
  }
  @Test public void accountSwitchesDropThePreviousBindingAndAudioPreferencesAreDurable() throws Exception {
    Memory memory=new Memory(); BilooRideAlertState s=ready(memory);
    s.receive(A,USER,NOW+30000,NOW,NOW,100);
    assertTrue(s.configure(OTHER,true,false,false,"am",NOW+1));
    BilooRideAlertState restored=new BilooRideAlertState(memory);
    assertNull(restored.active()); assertFalse(restored.sounds());assertFalse(restored.vibration());assertEquals("am",restored.language());
    assertEquals(0,restored.receive(B,USER,NOW+30000,NOW,NOW,100));
  }
  @Test public void tombstonesStayBoundedAndMetricsNeverStoreRiderOrTokenData() throws Exception {
    Memory memory=new Memory();BilooRideAlertState s=ready(memory);
    for(int i=0;i<100;i++) s.close(String.format("%08x-1111-4111-8111-111111111111",i),USER,NOW+i);
    assertTrue(new JSONObject(memory.value).getJSONObject("seen").length()<=64);
    s.displayed(NOW);s.opened();assertEquals(1,s.metrics().getLong("displayed"));
    assertFalse(s.metrics().has("userId"));assertFalse(s.metrics().has("token"));
  }
}
