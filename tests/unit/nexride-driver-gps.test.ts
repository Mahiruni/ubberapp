import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DRIVER_GPS_MAX_AGE_MS, DRIVER_GPS_MAX_ACCURACY_METERS,
  DRIVER_GPS_HEARTBEAT_MS, driverGpsHealth, gpsFixUsable,
} from "../../lib/nexride-driver-gps";

describe("NexRide verified Driver GPS presence", () => {
  const now = 1_800_000_000_000;
  it("accepts only plausible, recent device fixes", () => {
    const good = { latitude: 9.008, longitude: 38.775, accuracy: 12, timestamp: now - 3000 };
    expect(gpsFixUsable(good, now)).toBe(true);
    expect(gpsFixUsable({ ...good, timestamp: now - 35_000 }, now)).toBe(false);
    expect(gpsFixUsable({ ...good, timestamp: now + 11_000 }, now)).toBe(false);
    expect(gpsFixUsable({ ...good, accuracy: -1 }, now)).toBe(false);
    expect(gpsFixUsable({ ...good, latitude: Infinity }, now)).toBe(false);
    expect(gpsFixUsable({ ...good, latitude: 100 }, now)).toBe(false);
  });
  it("fails closed for missing, stale or inaccurate GPS", () => {
    expect(driverGpsHealth(null, now)).toBe("waiting");
    expect(driverGpsHealth({ timestamp: now, accuracy: 15 }, now)).toBe("ready");
    expect(driverGpsHealth({ timestamp: now - DRIVER_GPS_MAX_AGE_MS, accuracy: DRIVER_GPS_MAX_ACCURACY_METERS }, now)).toBe("ready");
    expect(driverGpsHealth({ timestamp: now - DRIVER_GPS_MAX_AGE_MS - 1, accuracy: 10 }, now)).toBe("stale");
    expect(driverGpsHealth({ timestamp: now - 1000, accuracy: 151 }, now)).toBe("inaccurate");
    expect(driverGpsHealth({ timestamp: now - 1000, accuracy: null }, now)).toBe("inaccurate");
    expect(DRIVER_GPS_HEARTBEAT_MS).toBeLessThan(DRIVER_GPS_MAX_AGE_MS);
  });
  it("ships an Android foreground location service rather than a suspended WebView timer", () => {
    const service = readFileSync("native/android/NexRideDriverLocationService.java", "utf8");
    const plugin = readFileSync("native/android/NexRideDriverLocationPlugin.java", "utf8");
    const installer = readFileSync("scripts/setup-android-reliability.mjs", "utf8");
    expect(service).toContain("ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION");
    expect(service).toContain("START_NOT_STICKY");
    expect(service).toContain("requestLocationUpdates(LocationManager.GPS_PROVIDER,10_000L,0f");
    expect(service).toContain("requestLocationUpdates(LocationManager.NETWORK_PROVIDER,15_000L,0f");
    expect(service).toContain("SystemClock.elapsedRealtime()");
    expect(service).toContain("refreshSession()");
    expect(service).toContain("lastServerAckAt=System.currentTimeMillis()");
    expect(service).toContain("status==401 || status==403 || status==409");
    expect(service).not.toContain("getSharedPreferences(");
    expect(plugin).toContain("ACCESS_FINE_LOCATION");
    expect(plugin).toContain("getLastServerAckAt()");
    expect(installer).toContain('android:foregroundServiceType="location"');
    expect(installer).toContain("FOREGROUND_SERVICE_LOCATION");
  });

  it("keeps native GPS role restricted and preserves signed-out cleanup", () => {
    const client = readFileSync("lib/nexride-native-reliability.ts", "utf8");
    const shell = readFileSync("components/nexride/driver-session-bridge.tsx", "utf8");
    expect(client).toContain('getNexRideNativeAppRole() !== "driver"');
    expect(client).toContain("reconcileNativeDriverGpsSession");
    expect(client).toContain("refreshToken: data.session.refresh_token");
    expect(shell).toContain('document.visibilityState !== "visible"');
    expect(shell).toContain("snapshot.lastServerAckAt");
    expect(shell).toContain("stopNativeDriverGps()");
  });

  it("enforces the same timestamp/accuracy limits at dispatch and Rider map boundaries", () => {
    const migration = readFileSync("supabase/migrations/20261011152000_nexride_verified_driver_presence_dispatch.sql", "utf8");
    const nearby = readFileSync("app/api/rider/nearby-drivers/route.ts", "utf8");
    expect(migration.match(/d\.gps_recorded_at >= now\(\)-interval '60 seconds'/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration).toContain("d.gps_accuracy_meters between 0 and 150");
    expect(migration).toContain("d.last_presence_at >= now()-interval '60 seconds'");
    expect(nearby).toContain('.gte("gps_recorded_at", newestGps)');
    expect(nearby).toContain('.lte("gps_accuracy_meters", DRIVER_GPS_MAX_ACCURACY_METERS)');
    expect(nearby).not.toContain("driver.updated_at,");
  });
});
