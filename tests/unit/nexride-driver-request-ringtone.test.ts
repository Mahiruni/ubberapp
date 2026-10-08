import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  emitNexRideFeedback,
  isRideRequestAlertActive,
  startRideRequestAlert,
  stopRideRequestAlert,
  RIDE_REQUEST_ALERT_DURATION_MS,
} from "../../lib/nexride-feedback";

class FakeAudio {
  loop = false;
  volume = 1;
  preload = "";
  currentTime = 0;
  muted = false;
  play = vi.fn(async () => {});
  pause = vi.fn();
}
let players: FakeAudio[] = [];
let serial = 0;
function nextId() { return "offer-unit-" + ++serial; }

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-08T12:00:00Z"));
  players = [];
  vi.stubGlobal("window", {
    localStorage: { getItem: () => null },
    dispatchEvent: () => true,
    setTimeout, clearTimeout,
  });
  vi.stubGlobal("Audio", class extends FakeAudio {
    constructor(_url: string) { super(); players.push(this); }
  });
  vi.stubGlobal("navigator", { vibrate: vi.fn() });
});
afterEach(() => {
  stopRideRequestAlert();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("NexRide driver incoming-request ringtone", () => {
  it("loops for 30 seconds, not only for the MP3's first short clip", () => {
    const id = nextId();
    expect(RIDE_REQUEST_ALERT_DURATION_MS).toBe(30_000);
    emitNexRideFeedback({ event: "ride_request", id });
    expect(isRideRequestAlertActive(id)).toBe(true);
    expect(players[0].loop).toBe(true);
    vi.advanceTimersByTime(29_999);
    expect(isRideRequestAlertActive(id)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isRideRequestAlertActive(id)).toBe(false);
    expect(players[0].pause).toHaveBeenCalled();
  });

  it("does not silence or restart a still-pending offer on screen handoff", () => {
    const id = nextId();
    emitNexRideFeedback({ event: "ride_request", id });
    const audio = players[0];
    const initialPauseCount = audio.pause.mock.calls.length;
    vi.advanceTimersByTime(15_000);
    // Request page emits the same offer after a Dashboard notification.
    emitNexRideFeedback({ event: "ride_request", id });
    expect(isRideRequestAlertActive(id)).toBe(true);
    expect(audio.pause).toHaveBeenCalledTimes(initialPauseCount);
    vi.advanceTimersByTime(14_999);
    expect(isRideRequestAlertActive(id)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isRideRequestAlertActive(id)).toBe(false);
  });

  it("stops immediately when accepted, declined or withdrawn", () => {
    const id = nextId();
    startRideRequestAlert(id);
    vi.advanceTimersByTime(5_000);
    stopRideRequestAlert(id);
    expect(isRideRequestAlertActive()).toBe(false);
  });

  it("stops at authoritative expiry if an offer has fewer than 30 seconds left", () => {
    const id = nextId();
    startRideRequestAlert(id, new Date(Date.now() + 7_000).toISOString());
    vi.advanceTimersByTime(6_999);
    expect(isRideRequestAlertActive(id)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isRideRequestAlertActive(id)).toBe(false);
  });

  it("ignores a stale stop event for a newer ride offer", () => {
    const old = nextId();
    const current = nextId();
    startRideRequestAlert(old);
    startRideRequestAlert(current);
    stopRideRequestAlert(old);
    expect(isRideRequestAlertActive(current)).toBe(true);
  });
});
