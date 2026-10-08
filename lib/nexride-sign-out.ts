import { supabase } from "./supabase";
import { markExplicitSignOut, retryStartup, type SignedOutRole } from "./nexride-startup";

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
  retryStartup(false);
}
