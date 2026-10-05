import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import {
  completedStartup,
  enterRider,
  initializeRider,
  retryStartup,
  restorePreferences,
  startupDestination,
  StartupError,
  updateStartupPreferences,
} from "../../lib/nexride-startup";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("../../lib/supabase", () => ({ supabase: { auth: { getSession } } }));
const session = { access_token: "test-session" } as Session;
let values: Map<string, string>;
let storage: Storage;
beforeEach(() => {
  values = new Map();
  storage = {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  } as Storage;
  vi.stubGlobal("window", { localStorage: storage });
  vi.stubGlobal("localStorage", storage);
  retryStartup();
  getSession
    .mockReset()
    .mockResolvedValue({ data: { session: null }, error: null });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("rider initialization", () => {
  it("routes first visits, signed-out users, restored sessions and explicit previews", () => {
    const state = {
      session: null,
      returningPreview: false,
      previewEnabled: false,
      onboardingComplete: false,
    };
    expect(startupDestination(state)).toBe("/onboarding");
    expect(startupDestination({ ...state, onboardingComplete: true })).toBe(
      "/rider/sign-in",
    );
    expect(startupDestination({ ...state, session })).toBe("/");
    expect(startupDestination({ ...state, previewEnabled: true })).toBe("/");
    expect(startupDestination({ ...state, returningPreview: true })).toBe("/");
  });
  it("deduplicates session restoration and completes without a minimum display delay", async () => {
    getSession.mockResolvedValue({ data: { session }, error: null });
    const first = initializeRider();
    expect(initializeRider()).toBe(first);
    expect(await first).toMatchObject({ destination: "/", session });
    await initializeRider();
    expect(getSession).toHaveBeenCalledTimes(1);
  });
  it("allows retry after a failed session restoration", async () => {
    getSession.mockResolvedValueOnce({
      data: { session: null },
      error: new Error("offline"),
    });
    await expect(initializeRider()).rejects.toMatchObject({ kind: "session" });
    expect(completedStartup()).toBeNull();
    getSession.mockResolvedValueOnce({ data: { session }, error: null });
    expect((await initializeRider()).destination).toBe("/");
  });
  it("bounds a stalled service and offers another initialization attempt", async () => {
    vi.useFakeTimers();
    getSession.mockImplementationOnce(() => new Promise(() => {}));
    const result = initializeRider();
    const rejection = expect(result).rejects.toMatchObject({ kind: "session" });
    await vi.advanceTimersByTimeAsync(8000);
    await rejection;
    expect((await initializeRider()).destination).toBe("/onboarding");
  });
  it("recovers corrupted preferences without removing the Supabase session", async () => {
    values.set("nexride-preview-v2", "bad json");
    values.set("sb-session", "auth-data");
    expect(() => restorePreferences(storage)).toThrow(StartupError);
    retryStartup(true);
    expect(values.get("sb-session")).toBe("auth-data");
    expect((await initializeRider()).destination).toBe("/onboarding");
  });
  it("migrates the legacy profile without retaining its password", () => {
    values.set(
      "nexride-state",
      JSON.stringify({
        form: { name: "Rider", password: "obsolete" },
        language: "am",
      }),
    );
    const restored = restorePreferences(storage);
    expect(restored.preferences.profile.name).toBe("Rider");
    expect(restored.preferences.language).toBe("am");
    expect(JSON.stringify(restored)).not.toContain("password");
    expect(values.has("nexride-state")).toBe(false);
  });
  it("keeps entry language and updated preferences across route transitions", () => {
    values.set("nexride:language", "am");
    enterRider(null);
    const preferences = completedStartup()!.preferences;
    expect(preferences.language).toBe("am");
    updateStartupPreferences({
      ...preferences,
      profile: { name: "Updated", email: "", phone: "" },
    });
    expect(completedStartup()!.preferences.profile.name).toBe("Updated");
  });
  it("allows explicit entry when browser storage is unavailable", () => {
    vi.stubGlobal("window", {
      get localStorage() {
        throw new Error("blocked");
      },
    });
    expect(() => enterRider(null)).not.toThrow();
    expect(completedStartup()?.destination).toBe("/");
  });
});
