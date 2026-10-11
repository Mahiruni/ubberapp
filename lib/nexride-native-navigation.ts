/**
 * Single navigation coordinator used by the Rider and Driver WebViews.
 * The Android Capacitor App plugin owns the hardware/gesture Back event;
 * web handlers own only their mounted, non-destructive UI state.
 */
export type NexRideBackHandler = () => boolean;
type Entry = { id: number; priority: number; handler: NexRideBackHandler };
const handlers: Entry[] = [];
let nextId = 0;

export function registerNexRideBackHandler(handler: NexRideBackHandler, priority = 0): () => void {
  const entry = { id: ++nextId, priority, handler };
  handlers.push(entry);
  return () => {
    const index = handlers.indexOf(entry);
    if (index >= 0) handlers.splice(index, 1);
  };
}

export function consumeNexRideBackHandlers(): boolean {
  const sorted = [...handlers].sort((a, b) => b.priority - a.priority || b.id - a.id);
  for (const entry of sorted) {
    if (!handlers.includes(entry)) continue;
    if (entry.handler()) return true;
  }
  return false;
}

/** Deliberate parents prevent WebView history from returning to obsolete sign-in pages. */
export function nexrideSafeParentPath(path: string, search = ""): string | null {
  if (path === "/" || path === "/rider" || path === "/driver" || path === "/driver/home") return null;
  if (path.startsWith("/driver/earnings/report")) return "/driver/earnings";
  if (path.startsWith("/driver/profile/")) return "/driver/profile";
  if (path.startsWith("/driver/") && (
    path.startsWith("/driver/navigation") || path.startsWith("/driver/request") ||
    path.startsWith("/driver/pickup") || path.startsWith("/driver/profile") ||
    path.startsWith("/driver/earnings") || path.startsWith("/driver/activity")
  )) return "/driver/home";
  if (path.startsWith("/driver/")) return "/driver";
  if (path.startsWith("/rider/")) return "/rider";
  if (path === "/trip/chat") {
    return new URLSearchParams(search).get("role") === "driver" ? "/driver/home" : "/";
  }
  if (path === "/account/manage" || path === "/safety" || path === "/support") {
    return new URLSearchParams(search).get("role") === "driver" ? "/driver/home" : "/";
  }
  return "/";
}
