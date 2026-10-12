import { afterEach, describe, it, expect, vi } from "vitest";
import {
  nextNexRideManeuver,
  type NavPoint, type NavStep,
} from "../../lib/nexride-navigation-guidance";
import { readNexRideFeedbackPreferences } from "../../lib/nexride-feedback";

const origin: NavPoint = { lat: 9, lng: 38.75 };
const route: NavPoint[] = [
  origin, { lat: 9.001, lng: 38.75 }, { lat: 9.002, lng: 38.75 },
  { lat: 9.002, lng: 38.751 }, { lat: 9.002, lng: 38.752 },
];
const steps: NavStep[] = [
  { type: "depart", instruction: "Head north", maneuver: origin },
  { type: "turn", modifier: "right", instruction: "Turn right onto Main St", maneuver: route[2] },
  { type: "arrive", instruction: "Arrive at your destination", maneuver: route[4] },
];

afterEach(() => vi.unstubAllGlobals());

describe("Driver visual turn-by-turn navigation", () => {
  it("projects the next maneuver onto road geometry", () => {
    const maneuver = nextNexRideManeuver(route, steps, { lat: 9.001, lng: 38.75 });
    expect(maneuver?.step.instruction).toBe("Turn right onto Main St");
    expect(maneuver?.distanceMeters).toBeGreaterThan(105);
    expect(maneuver?.distanceMeters).toBeLessThan(118);
  });

  it("advances to the next on-screen maneuver after passing a turn", () => {
    const maneuver = nextNexRideManeuver(route, steps, { lat: 9.002, lng: 38.7512 });
    expect(maneuver?.step.type).toBe("arrive");
  });

  it("does not display an incorrect maneuver off-route", () => {
    expect(nextNexRideManeuver(route, steps, { lat: 9.01, lng: 38.75 })).toBeNull();
  });

  it("removes obsolete spoken-navigation values from saved device preferences", () => {
    const saved = new Map<string, string>([
      ["nexride:feedback:v1", JSON.stringify({
        sounds: true, rideRequests: true, messages: false, tripUpdates: true,
        haptics: true, navigationVoice: true, navigationLanguage: "am", navigationVolume: 1,
      })],
    ]);
    const setItem = vi.fn((key: string, value: string) => saved.set(key, value));
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem,
    } });
    const cleaned = readNexRideFeedbackPreferences();
    expect(cleaned.messages).toBe(false);
    expect(Object.keys(cleaned)).toHaveLength(5);
    expect(setItem).toHaveBeenCalledOnce();
    expect(JSON.parse(saved.get("nexride:feedback:v1")!)).toEqual(cleaned);
  });

  it("stores only notification, sound, and haptic preferences", () => {
    const preferences = readNexRideFeedbackPreferences();
    expect(Object.keys(preferences).sort()).toEqual([
      "haptics", "messages", "rideRequests", "sounds", "tripUpdates",
    ]);
  });
});
