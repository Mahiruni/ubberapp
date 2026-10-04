import type { Session } from "@supabase/supabase-js";
import type { Language } from "./nexride-i18n";
import type { PreviewProfile, PreviewTrip } from "./nexride-preview";
export const PREVIEW_STORAGE_KEY = "nexride-preview-v2";
export const ONBOARDING_KEY = "nexride:onboarding-complete";
export const PREVIEW_ENABLED_KEY = "nexride:preview-enabled";
export const LANGUAGE_KEY = "nexride:language";
export type StartupDestination = "/" | "/onboarding" | "/auth";
export type RestoredPreferences = {
  language: Language;
  mode: "rider" | "driver";
  theme: "light" | "dark";
  profile: PreviewProfile;
  trip: PreviewTrip | null;
};
export type StartupResult = {
  preferences: RestoredPreferences;
  destination: StartupDestination;
  session: Session | null;
};
export class StartupError extends Error {
  constructor(public readonly kind: "preferences" | "session") {
    super(
      kind === "preferences"
        ? "Unable to restore saved preferences."
        : "Unable to restore the session.",
    );
    this.name = "StartupError";
  }
}
const defaults = (): RestoredPreferences => ({
  language: "en",
  mode: "rider",
  theme: "light",
  profile: { name: "", phone: "", email: "" },
  trip: null,
});
export function storedLanguage(storage: Pick<Storage, "getItem">): Language {
  try {
    const locale = storage.getItem(LANGUAGE_KEY);
    if (locale) return locale === "am" ? "am" : "en";
    const state = JSON.parse(
      storage.getItem(PREVIEW_STORAGE_KEY) ||
        storage.getItem("nexride-state") ||
        "{}",
    );
    return state?.language === "am" ? "am" : "en";
  } catch {
    return "en";
  }
}
export function restorePreferences(
  storage: Pick<Storage, "getItem" | "removeItem">,
): {
  preferences: RestoredPreferences;
  returningPreview: boolean;
  onboardingComplete: boolean;
  previewEnabled: boolean;
} {
  let saved: string | null,
    legacy: string | null,
    onboardingComplete: boolean,
    previewEnabled: boolean,
    locale: string | null;
  try {
    saved = storage.getItem(PREVIEW_STORAGE_KEY);
    legacy = storage.getItem("nexride-state");
    onboardingComplete = storage.getItem(ONBOARDING_KEY) === "true";
    previewEnabled = storage.getItem(PREVIEW_ENABLED_KEY) === "true";
    locale = storage.getItem(LANGUAGE_KEY);
  } catch {
    return {
      preferences: defaults(),
      returningPreview: false,
      onboardingComplete: false,
      previewEnabled: false,
    };
  }
  let state: Record<string, unknown>;
  try {
    state = JSON.parse(saved || legacy || "{}");
    if (!state || typeof state !== "object" || Array.isArray(state))
      throw new Error("Invalid preferences");
  } catch {
    throw new StartupError("preferences");
  }
  const preferences = defaults();
  preferences.language = (locale || state.language) === "am" ? "am" : "en";
  preferences.mode = state.mode === "driver" ? "driver" : "rider";
  preferences.theme = state.theme === "dark" ? "dark" : "light";
  const profile = (saved ? state.profile : state.form) as
    Partial<PreviewProfile> | undefined;
  if (profile && typeof profile === "object")
    preferences.profile = {
      name: typeof profile.name === "string" ? profile.name : "",
      phone: typeof profile.phone === "string" ? profile.phone : "",
      email: typeof profile.email === "string" ? profile.email : "",
    };
  const trip = state.trip as PreviewTrip | undefined;
  if (
    trip &&
    typeof trip.destination === "string" &&
    typeof trip.amount === "number" &&
    Number.isFinite(trip.amount) &&
    ["economy", "comfort", "premium", "xl"].includes(trip.ride)
  )
    preferences.trip = {
      pickup: typeof trip.pickup === "string" ? trip.pickup : "",
      destination: trip.destination,
      ride: trip.ride,
      amount: trip.amount,
      completed: trip.completed === true,
      rating:
        typeof trip.rating === "number"
          ? Math.min(5, Math.max(0, trip.rating))
          : 0,
    };
  try {
    storage.removeItem("nexride-state");
  } catch {}
  return {
    preferences,
    returningPreview: Boolean(saved || legacy),
    onboardingComplete,
    previewEnabled,
  };
}
export function startupDestination({
  session,
  returningPreview,
  previewEnabled,
  onboardingComplete,
}: {
  session: Session | null;
  returningPreview: boolean;
  previewEnabled: boolean;
  onboardingComplete: boolean;
}): StartupDestination {
  if (session || returningPreview || previewEnabled) return "/";
  return onboardingComplete ? "/auth" : "/onboarding";
}
let pending: Promise<StartupResult> | null = null;
let completed: StartupResult | null = null;
export function completedStartup() {
  return typeof window === "undefined" ? null : completed;
}
export function initializeRider(): Promise<StartupResult> {
  if (completed) return Promise.resolve(completed);
  if (pending) return pending;
  pending = (async () => {
    let restored = {
      preferences: defaults(),
      returningPreview: false,
      onboardingComplete: false,
      previewEnabled: false,
    };
    try {
      restored = restorePreferences(window.localStorage);
    } catch (error) {
      if (error instanceof StartupError) throw error;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        import("./supabase").then(({ supabase }) => supabase.auth.getSession()),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new StartupError("session")), 8000);
        }),
      ]);
      if (result.error) throw new StartupError("session");
      const session = result.data.session;
      const destination = startupDestination({ ...restored, session });
      completed = { preferences: restored.preferences, destination, session };
      return completed;
    } catch (error) {
      throw error instanceof StartupError ? error : new StartupError("session");
    } finally {
      if (timer) clearTimeout(timer);
    }
  })().catch((error) => {
    pending = null;
    throw error;
  });
  return pending;
}
// Successful auth/explicit preview access updates the already completed initialization;
// moving between routes does not replay or rerun the full splash.
export function enterRider(session: Session | null) {
  let preferences = defaults();
  try {
    preferences = restorePreferences(window.localStorage).preferences;
  } catch {}
  completed = { preferences, destination: "/", session };
  pending = null;
}
export function updateStartupPreferences(preferences: RestoredPreferences) {
  if (completed) completed = { ...completed, preferences };
}
export function retryStartup(resetPreferences = false) {
  pending = null;
  completed = null;
  if (resetPreferences) {
    try {
      localStorage.removeItem(PREVIEW_STORAGE_KEY);
      localStorage.removeItem("nexride-state");
    } catch {}
  }
}
