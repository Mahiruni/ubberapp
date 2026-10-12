package com.nexride.APP_ROLE;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class NexRideLockRulesTest {
    @Test public void rejectsWeakAndMalformedPins() {
        for (String pin : new String[]{"123456", "654321", "000000", "111111", "012345", "12345", "1234567", "12a456", "", "１２３４５６"}) assertFalse(pin, NexRideLockRules.validPin(pin));
        assertFalse(NexRideLockRules.validPin(null));
        assertTrue(NexRideLockRules.validPin("472951"));
        assertTrue(NexRideLockRules.validPin("073829"));
    }
    @Test public void fillsSkippedHorizontalVerticalAndDiagonalDots() {
        for (List<Integer> expected : Arrays.asList(Arrays.asList(0,1,2), Arrays.asList(0,3,6), Arrays.asList(0,4,8), Arrays.asList(2,4,6))) {
            List<Integer> dots = new ArrayList<>();
            NexRideLockRules.addDot(dots, expected.get(0)); NexRideLockRules.addDot(dots, expected.get(2));
            assertEquals(expected, dots);
        }
    }
    @Test public void neverDuplicatesDotsAndDoesNotAddInvalidIntermediateDots() {
        List<Integer> dots = new ArrayList<>();
        for (int dot : new int[]{0,1,2,0,2,-1,9}) NexRideLockRules.addDot(dots,dot);
        assertEquals(Arrays.asList(0,1,2), dots);
        dots.clear(); NexRideLockRules.addDot(dots,0); NexRideLockRules.addDot(dots,5);
        assertEquals(Arrays.asList(0,5), dots);
        dots.clear(); for (int dot : new int[]{1,0,2}) NexRideLockRules.addDot(dots,dot);
        assertEquals(Arrays.asList(1,0,2), dots);
    }
    @Test public void progressiveCooldownIsBoundedAndRollbackCannotBypassIt() {
        assertEquals(0, NexRideLockRules.delayMillis(4));
        assertEquals(30_000, NexRideLockRules.delayMillis(5));
        assertEquals(60_000, NexRideLockRules.delayMillis(6));
        assertEquals(900_000, NexRideLockRules.delayMillis(1000));
        assertEquals(30_000, NexRideLockRules.remaining(90,100,30_000));
        assertEquals(29_900, NexRideLockRules.remaining(200,100,30_000));
        assertEquals(0, NexRideLockRules.remaining(30_100,100,30_000));
    }
}
