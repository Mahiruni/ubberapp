"use client";

import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";

type DriverSheetSnap = "collapsed" | "medium" | "expanded";

const SNAP_RATIO: Record<DriverSheetSnap, number> = {
  collapsed: 0.27,
  medium: 0.46,
  expanded: 0.73,
};

const ORDER: DriverSheetSnap[] = ["collapsed", "medium", "expanded"];

export function DriverBottomSheet({
  children,
  className = "",
  label,
  defaultSnap = "medium",
}: {
  children: ReactNode;
  className?: string;
  label: string;
  defaultSnap?: DriverSheetSnap;
}) {
  const [snap, setSnap] = useState<DriverSheetSnap>(defaultSnap);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startHeight: number; lastY: number; lastAt: number; velocity: number } | null>(null);

  const viewportHeight = () => Math.max(1, window.visualViewport?.height || window.innerHeight || 800);
  const heightFor = (value: DriverSheetSnap) => viewportHeight() * SNAP_RATIO[value];

  const begin = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const height = dragHeight ?? heightFor(snap);
    drag.current = {
      startY: event.clientY,
      startHeight: height,
      lastY: event.clientY,
      lastAt: performance.now(),
      velocity: 0,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragHeight(height);
  };

  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current) return;
    const now = performance.now();
    const elapsed = Math.max(1, now - current.lastAt);
    current.velocity = (event.clientY - current.lastY) / elapsed;
    current.lastY = event.clientY;
    current.lastAt = now;
    const vh = viewportHeight();
    const next = Math.max(vh * 0.24, Math.min(vh * 0.75, current.startHeight - (event.clientY - current.startY)));
    setDragHeight(next);
  };

  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const vh = viewportHeight();
    const currentHeight = dragHeight ?? current.startHeight;
    const ratio = currentHeight / vh;
    let next = ORDER.reduce((best, item) =>
      Math.abs(SNAP_RATIO[item] - ratio) < Math.abs(SNAP_RATIO[best] - ratio) ? item : best,
    "medium" as DriverSheetSnap);

    if (Math.abs(current.velocity) > 0.45) {
      const index = ORDER.indexOf(next);
      next = current.velocity < 0 ? ORDER[Math.min(ORDER.length - 1, index + 1)] : ORDER[Math.max(0, index - 1)];
    }

    drag.current = null;
    setDragHeight(null);
    setSnap(next);
  };

  const cycle = () => {
    const index = ORDER.indexOf(snap);
    setSnap(ORDER[(index + 1) % ORDER.length]);
  };

  const style = {
    "--nr-driver-sheet-height": dragHeight ? `${Math.round(dragHeight)}px` : `${Math.round(SNAP_RATIO[snap] * 100)}dvh`,
  } as CSSProperties;

  return (
    <section
      className={`nr-driver-sheet ${className}`.trim()}
      data-snap={snap}
      style={style}
      aria-label={label}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="nr-driver-sheet-grab"
        aria-label="Resize driver panel"
        onClick={cycle}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
      >
        <span aria-hidden="true" />
      </button>
      <div className="nr-driver-sheet-content">{children}</div>
    </section>
  );
}
