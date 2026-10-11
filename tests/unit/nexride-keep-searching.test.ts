import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { newerMatch, type MatchSnapshot } from "../../lib/nexride-matching";
import { translate } from "../../lib/nexride-i18n";

const sql = readFileSync(
  "supabase/migrations/20261011111500_nexride_keep_searching_matching_recovery.sql",
  "utf8",
);

const matchingUi = readFileSync("components/nexride/matching.tsx", "utf8");
const matchingHook = readFileSync("lib/nexride-use-matching.ts", "utf8");

const snapshot = (status: MatchSnapshot["status"], version: number): MatchSnapshot => ({
  requestId: "same-ride",
  version,
  status,
  cancellation: { allowed: true, requiresConfirmation: false, fee: 0, reason: null },
  canRetry: status === "no_drivers",
  canChangeCategory: status === "no_drivers",
});

describe("NexRide persistent same-booking search", () => {
  it("renews dispatch from the current search window, not the original booking timestamp", () => {
    expect(sql).toContain("coalesce(ride.dispatch_started_at,ride.created_at) <= now() - interval '4 minutes'");
    expect(sql).toContain("coalesce(r.dispatch_started_at,r.created_at)>now()-interval '4 minutes'");
    expect(sql).toContain("set dispatch_state='searching',");
    expect(sql).toContain("dispatch_started_at=now()");
    expect(sql).not.toMatch(/delete from public\.ride_request_offers/);
  });

  it("retains one-driver-at-a-time offers and existing expired-offer forwarding", () => {
    expect(sql).toContain("if exists(select 1 from public.ride_request_offers");
    expect(sql).toContain("status='pending'");
    expect(sql).toContain("45 seconds");
    expect(sql).toContain("for update of d skip locked");
    expect(sql).toContain("gps_recorded_at >= now()-interval '60 seconds'");
    expect(sql).toContain("gps_accuracy_meters between 0 and 150");
  });

  it("accepts a newer searching snapshot on the SAME ride, but never revives cancelled rides", () => {
    const noDrivers = snapshot("no_drivers", 9);
    const resumed = newerMatch(noDrivers, snapshot("searching", 10));
    expect(resumed.requestId).toBe("same-ride");
    expect(resumed.status).toBe("searching");
    expect(newerMatch(resumed, snapshot("no_drivers", 9))).toBe(resumed);
    expect(newerMatch(snapshot("cancelled", 10), snapshot("searching", 11)).status).toBe("cancelled");
  });

  it("presents an actionable bilingual Keep searching while keeping Cancel available", () => {
    expect(translate("en", "matchingRetry")).toBe("Keep searching");
    expect(translate("am", "matchingRetry")).toBe("ፍለጋውን ቀጥል");
    expect(translate("en", "matchingKeepSearchingNote")).toContain("same request");
    expect(matchingUi).toContain("t('matchingKeepSearchingNote')");
    expect(matchingUi).toContain("status !== 'cancelled'");
    expect(matchingHook).toContain('snapshot.status !== "cancelled"');
  });
});
