import { describe, expect, it, vi } from "vitest";
vi.mock("../../lib/supabase", () => ({ supabase: {} }));
import { parseRiderGpsFix } from "../../lib/nexride-rider-live-location";

const fix = () => ({
  ride_request_id: "ride-1",
  latitude: 9.008,
  longitude: 38.775,
  accuracy_meters: 25,
  recorded_at: new Date().toISOString(),
});

describe("assigned Rider location validation", () => {
  it("accepts only the current ride request's valid GPS fix", () => {
    const result = parseRiderGpsFix(fix(), "ride-1");
    expect(result).toMatchObject({ lat: 9.008, lng: 38.775, accuracy: 25 });
  });
  it("never uses coordinates from another trip", () => {
    expect(parseRiderGpsFix(fix(), "ride-2")).toBeNull();
  });
  it("rejects invalid latitude and longitude", () => {
    expect(parseRiderGpsFix({ ...fix(), latitude: 100 }, "ride-1")).toBeNull();
    expect(parseRiderGpsFix({ ...fix(), longitude: 200 }, "ride-1")).toBeNull();
  });
  it("rejects invalid and future timestamps", () => {
    expect(parseRiderGpsFix({ ...fix(), recorded_at: "invalid" }, "ride-1")).toBeNull();
    expect(parseRiderGpsFix({ ...fix(), recorded_at: new Date(Date.now() + 60000).toISOString() }, "ride-1")).toBeNull();
  });
  it("does not invent a GPS accuracy when missing", () => {
    expect(parseRiderGpsFix({ ...fix(), accuracy_meters: null }, "ride-1")?.accuracy).toBeNull();
  });
});
