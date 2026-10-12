package com.nexride.APP_ROLE;

import java.util.List;

/** Pure rules shared by the native screen and executable JVM security tests. */
public final class NexRideLockRules {
    private NexRideLockRules() {}
    public static boolean validPin(String pin) {
        if (pin == null || !pin.matches("[0-9]{6}")) return false;
        if (pin.matches("(.)\\1{5}")) return false;
        return !"0123456789012345".contains(pin) && !"9876543210987654".contains(pin);
    }
    public static void addDot(List<Integer> dots, int dot) {
        if (dot < 0 || dot > 8 || dots.contains(dot)) return;
        if (!dots.isEmpty()) {
            int last = dots.get(dots.size() - 1);
            int row = dot / 3 - last / 3, col = dot % 3 - last % 3;
            if ((Math.abs(row) == 2 || Math.abs(col) == 2) && row % 2 == 0 && col % 2 == 0) {
                int middle = (last / 3 + row / 2) * 3 + last % 3 + col / 2;
                if (!dots.contains(middle)) dots.add(middle);
            }
        }
        dots.add(dot);
    }
    public static long delayMillis(int failures) {
        if (failures < 5) return 0;
        return Math.min(900_000L, 30_000L << Math.min(5, failures - 5));
    }
    public static long remaining(long now, long started, long duration) {
        // Rollback never removes a delay. Boot changes are normalized by the store.
        if (now < started) return duration;
        return Math.max(0, duration - (now - started));
    }
}
