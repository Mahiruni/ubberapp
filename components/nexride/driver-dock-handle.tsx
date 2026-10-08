"use client";

import { useRef, type PointerEvent, type KeyboardEvent } from "react";
import { cycleDriverDockSnap, snapDriverDockFromDrag, type DriverDockSnap } from "../../lib/nexride-driver-dock";

export function DriverDockHandle({
  snap,
  onChange,
  language,
}: {
  snap: DriverDockSnap;
  onChange: (next: DriverDockSnap) => void;
  language: "en" | "am";
}) {
  const start = useRef<{ y: number; pointerId: number } | null>(null);
  const ignoreClick = useRef(false);
  const am = language === "am";
  const label = snap === "expanded"
    ? (am ? "የአሽከርካሪውን ፓነል ቀንስ" : "Minimize driver panel")
    : (am ? "የአሽከርካሪውን ፓነል ዘርጋ" : "Expand driver panel");

  const down = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    start.current = { y: event.clientY, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const up = (event: PointerEvent<HTMLButtonElement>) => {
    const current = start.current;
    if (!current || current.pointerId !== event.pointerId) return;
    start.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const delta = event.clientY - current.y;
    if (Math.abs(delta) < 36) return;
    ignoreClick.current = true;
    const next = snapDriverDockFromDrag(snap, delta);
    if (next !== snap) onChange(next);
  };
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    onChange(snapDriverDockFromDrag(snap, event.key === "ArrowUp" ? -50 : 50));
  };
  const click = () => {
    if (ignoreClick.current) {
      ignoreClick.current = false;
      return;
    }
    onChange(cycleDriverDockSnap(snap));
  };

  return (
    <button
      type="button"
      className="nr-driver-dock-handle"
      aria-label={label}
      aria-controls="nr-driver-dock-extra"
      aria-expanded={snap === "expanded"}
      title={label}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={() => { start.current = null; }}
      onKeyDown={keyboard}
      onClick={click}
    >
      <span className="nr-driver-dock-handle-bar" aria-hidden="true" />
      <span className="nr-driver-dock-handle-hint" aria-hidden="true">{am ? "የአሽከርካሪ ፓነል" : "DRIVER CONTROL"}</span>
      <span className="nr-driver-dock-handle-state" aria-hidden="true">{snap === "expanded" ? "−" : "⌃"}</span>
    </button>
  );
}
