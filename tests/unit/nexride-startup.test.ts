import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import {
  completedStartup,
  enterRider,
  EXPLICIT_SIGNOUT_KEY,
  initializeRider,
  retryStartup,
  restorePreferences,
  startupDestination,
  StartupError,
  updateStartupPreferences,
} from "../../lib/nexride-startup";

const { getSession, resolveSessionRole } = vi.hoisted(() => ({
  getSession: vi.fn(),
  resolveSessionRole: vi.fn(),
}));
vi.mock("../../lib/supabase", () => ({ supabase: { auth: { getSession } } }));
vi.mock("../../lib/nexride-account-role", () => ({ resolveSessionRole }));
const session = {
  access_token: "test-session",
  user: {
    email: "rider@example.com",
    user_metadata: {
      role: "rider",
      full_name: "Test Rider",
      phone: "+251911000000",
    },
  },
} as unknown as Session;
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
  resolveSessionRole
    .mockReset()
    .mockImplementation(async (current: Session) =>
      String(current.user.user_metadata?.role || ""),
    );
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
    expect(startupDestination({ ...state, session, signedOutRole: "rider" })).toBe("/rider/sign-in");
    expect(startupDestination({ ...state, session, signedOutRole: "driver" })).toBe("/driver/auth");
  });

  it("keeps a logged-out Rider unauthenticated even when a guest preview is enabled", async () => {
    values.set(EXPLICIT_SIGNOUT_KEY, "rider");
    values.set("nexride:preview-enabled", "true");
    getSession.mockResolvedValue({ data: { session }, error: null });

    const result = await initializeRider();
    expect(result.destination).toBe("/");
    expect(result.session).toBeNull();
    expect(getSession).not.toHaveBeenCalled();
    expect(values.get(EXPLICIT_SIGNOUT_KEY)).toBe("rider");
  });

  it("keeps a logged-out Driver unauthenticated when guest preview is enabled", async () => {
    values.set(EXPLICIT_SIGNOUT_KEY, "driver");
    values.set("nexride:preview-enabled", "true");
    getSession.mockResolvedValue({ data: { session }, error: null });
    const result = await initializeRider();
    expect(result.destination).toBe("/");
    expect(result.session).toBeNull();
    expect(getSession).not.toHaveBeenCalled();
  });

  it("does not resurrect a rider session whose restoration was pending during logout", async () => {
    let resume!: (value: unknown) => void;
    getSession.mockImplementationOnce(() => new Promise(resolve => { resume = resolve; }));
    const pending = initializeRider();
    await vi.waitFor(() => expect(getSession).toHaveBeenCalledOnce());
    values.set(EXPLICIT_SIGNOUT_KEY, "rider");
    resume({ data: { session }, error: null });
    const result = await pending;
    expect(result.destination).toBe("/rider/sign-in");
    expect(result.session).toBeNull();
    expect(values.get(EXPLICIT_SIGNOUT_KEY)).toBe("rider");
  });
  it("ignores a stale enterRider(session) after logout", () => {
    values.set(EXPLICIT_SIGNOUT_KEY, "rider");
    enterRider(session);
    expect(completedStartup()).toBeNull();
    expect(values.get(EXPLICIT_SIGNOUT_KEY)).toBe("rider");
  });
  it("does not restore a persisted session after an explicit logout", async () => {
    values.set(EXPLICIT_SIGNOUT_KEY, "rider");
    getSession.mockResolvedValue({ data: { session }, error: null });

    const result = await initializeRider();

    expect(result.destination).toBe("/rider/sign-in");
    expect(result.session).toBeNull();
    expect(getSession).not.toHaveBeenCalled();
  });
  it("discards stale preview state when a persisted rider session is restored", async () => {
    values.set(
      "nexride-preview-v2",
      JSON.stringify({
        language: "am",
        theme: "dark",
        profile: { name: "Preview Rider", phone: "000", email: "preview@example.com" },
        trip: {
          pickup: "Preview pickup",
          destination: "Preview destination",
          ride: "economy",
          amount: 100,
          completed: false,
          rating: 0,
        },
      }),
    );
    values.set("nexride:preview-enabled", "true");
    getSession.mockResolvedValue({ data: { session }, error: null });

    const result = await initializeRider();

    expect(result.preferences.profile.name).toBe("Test Rider");
    expect(result.preferences.profile.email).toBe("rider@example.com");
    expect(result.preferences.trip).toBeNull();
    expect(result.preferences.language).toBe("am");
    expect(result.preferences.theme).toBe("dark");
    expect(values.has("nexride-preview-v2")).toBe(false);
    expect(values.has("nexride:preview-enabled")).toBe(false);
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
  it("replaces cached preview identity when an authenticated rider enters", () => {
    values.set(
      "nexride-preview-v2",
      JSON.stringify({
        language: "am",
        theme: "dark",
        profile: { name: "Preview Rider", phone: "000", email: "preview@example.com" },
        trip: {
          pickup: "Preview pickup",
          destination: "Preview destination",
          ride: "economy",
          amount: 100,
          completed: false,
          rating: 0,
        },
      }),
    );
    values.set("nexride:preview-enabled", "true");

    const riderSession = {
      access_token: "rider-session",
      user: {
        email: "rider@example.com",
        user_metadata: {
          role: "rider",
          full_name: "Real Rider",
          phone: "+251911000000",
        },
      },
    } as unknown as Session;

    enterRider(riderSession);

    expect(completedStartup()?.preferences.profile).toEqual({
      name: "Real Rider",
      phone: "+251911000000",
      email: "rider@example.com",
    });
    expect(completedStartup()?.preferences.trip).toBeNull();
    expect(completedStartup()?.preferences.language).toBe("am");
    expect(completedStartup()?.preferences.theme).toBe("dark");
    expect(values.has("nexride-preview-v2")).toBe(false);
    expect(values.has("nexride:preview-enabled")).toBe(false);
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
