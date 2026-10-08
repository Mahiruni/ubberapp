export type DriverDockSnap = "minimal" | "compact" | "expanded";

export function cycleDriverDockSnap(snap: DriverDockSnap): DriverDockSnap {
  if (snap === "compact") return "expanded";
  if (snap === "expanded") return "minimal";
  return "compact";
}

/** Negative displacement expands; positive displacement minimizes. */
export function snapDriverDockFromDrag(snap: DriverDockSnap, deltaY: number): DriverDockSnap {
  if (!Number.isFinite(deltaY) || Math.abs(deltaY) < 36) return snap;
  if (deltaY < 0) return snap === "minimal" ? "compact" : "expanded";
  return snap === "expanded" ? "compact" : "minimal";
}
