import { supabase } from "./supabase";
import { purgeOfflineTripContext } from "./nexride-offline-recovery";
import { clearNexRideLiveTrip } from "./nexride-live-trip";
import { unregisterNexRidePushDevice, stopNativeDriverGps } from "./nexride-native-reliability";
import { ACTIVE_ACCOUNT_ROLE_KEY, PREVIEW_ENABLED_KEY, markExplicitSignOut, retryStartup, type SignedOutRole } from "./nexride-startup";

/** Write the logout barrier before auth callbacks can restore an old session.
 * A deliberate successful sign-in must clear the barrier. Other devices stay
 * signed in because Supabase uses local sign-out scope.
 */
export async function signOutNexRide(role: SignedOutRole): Promise<void> {
  // Keep the logout barrier synchronous so auth listeners cannot restore
  // the account while native token cleanup is still pending.
  markExplicitSignOut(role);
  // Cleanup is best-effort; never delay the existing synchronous signOut call.
  void unregisterNexRidePushDevice(role).catch(() => {});
  if (role === "driver") void stopNativeDriverGps();
  const result = await supabase.auth.signOut({ scope: "local" });
  if (result.error) throw result.error;
  const current = await supabase.auth.getSession();
  if (current.error || current.data.session) throw new Error("Local session was not fully cleared");
  // End any local lock-screen trip tracker after verified local sign-out.
  // This is independent of Driver foreground GPS and Firebase device cleanup.
  void clearNexRideLiveTrip();
  // This flag is only a navigation preference. Discard it on logout so a
  // later visit cannot resume the old Driver/Rider experience implicitly.
  try {
    window.localStorage.removeItem(ACTIVE_ACCOUNT_ROLE_KEY);
    window.localStorage.removeItem(PREVIEW_ENABLED_KEY);
    purgeOfflineTripContext(window.localStorage);
  } catch {}
  retryStartup(false);
}
