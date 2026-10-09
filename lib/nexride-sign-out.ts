import { supabase } from "./supabase";
import { ACTIVE_ACCOUNT_ROLE_KEY, markExplicitSignOut, retryStartup, type SignedOutRole } from "./nexride-startup";

/** Write the logout barrier before auth callbacks can restore an old session.
 * A deliberate successful sign-in must clear the barrier. Other devices stay
 * signed in because Supabase uses local sign-out scope.
 */
export async function signOutNexRide(role: SignedOutRole): Promise<void> {
  markExplicitSignOut(role);
  const result = await supabase.auth.signOut({ scope: "local" });
  if (result.error) throw result.error;
  const current = await supabase.auth.getSession();
  if (current.error || current.data.session) throw new Error("Local session was not fully cleared");
  // This flag is only a navigation preference. Discard it on logout so a
  // later visit cannot resume the old Driver/Rider experience implicitly.
  try { window.localStorage.removeItem(ACTIVE_ACCOUNT_ROLE_KEY); } catch {}
  retryStartup(false);
}
