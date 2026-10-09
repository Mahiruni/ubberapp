"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";

type DriverSheetSnap = "collapsed" | "medium" | "expanded";

const SNAP_RATIO: Record<DriverSheetSnap, number> = {
  collapsed: 0.34,
  medium: 0.55,
  expanded: 0.82,
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
  const drag = useRef<{
    startY: number;
    startHeight: number;
    currentHeight: number;
    lastY: number;
    lastAt: number;
    velocity: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const panelRef = useRef<HTMLElement | null>(null);

  // Let map overlays follow the measured sheet instead of a fixed viewport ratio.
  useEffect(() => {
    const panel = panelRef.current;
    const parent = panel?.parentElement;
    if (!panel || !parent) return;
    const syncHeight = () => {
      parent.style.setProperty("--nr-driver-sheet-actual-height", Math.ceil(panel.getBoundingClientRect().height) + "px");
    };
    syncHeight();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(syncHeight);
    observer?.observe(panel);
    window.addEventListener("resize", syncHeight);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncHeight);
      parent.style.removeProperty("--nr-driver-sheet-actual-height");
    };
  }, []);

  const viewportHeight = () => Math.max(1, window.visualViewport?.height || window.innerHeight || 800);
  const heightFor = (value: DriverSheetSnap) => viewportHeight() * SNAP_RATIO[value];

  const begin = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const height = panelRef.current?.getBoundingClientRect().height || dragHeight || heightFor(snap);
    drag.current = {
      startY: event.clientY,
      startHeight: height,
      currentHeight: height,
      lastY: event.clientY,
      lastAt: performance.now(),
      velocity: 0,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragHeight(height);
  };

  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current) return;
    const now = performance.now();
    const elapsed = Math.max(1, now - current.lastAt);
    const instantVelocity = (event.clientY - current.lastY) / elapsed;
    current.velocity = current.velocity * 0.62 + instantVelocity * 0.38;
    current.lastY = event.clientY;
    current.lastAt = now;
    const vh = viewportHeight();
    const delta = event.clientY - current.startY;
    if (Math.abs(delta) > 4) current.moved = true;
    const next = Math.max(
      vh * 0.33,
      Math.min(vh * 0.84, current.startHeight - delta),
    );
    current.currentHeight = next;
    setDragHeight(next);
  };

  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const vh = viewportHeight();
    const currentHeight = current.currentHeight;
    const ratio = currentHeight / vh;
    let next = ORDER.reduce((best, item) =>
      Math.abs(SNAP_RATIO[item] - ratio) < Math.abs(SNAP_RATIO[best] - ratio) ? item : best,
    "medium" as DriverSheetSnap);

    if (Math.abs(current.velocity) > 0.38) {
      const index = ORDER.indexOf(next);
      next = current.velocity < 0 ? ORDER[Math.min(ORDER.length - 1, index + 1)] : ORDER[Math.max(0, index - 1)];
    }

    suppressClick.current = current.moved;
    drag.current = null;
    setDragHeight(null);
    setSnap(next);
  };

  const cycle = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const index = ORDER.indexOf(snap);
    setSnap(ORDER[(index + 1) % ORDER.length]);
  };

  const cancel = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
    setDragHeight(null);
  };

  const style = {
    "--nr-driver-sheet-height": dragHeight !== null ? `${Math.round(dragHeight)}px` : `${Math.round(SNAP_RATIO[snap] * 100)}dvh`,
  } as CSSProperties;

  return (
    <section
      ref={panelRef}
      className={`nr-driver-sheet ${className}`.trim()}
      data-snap={snap}
      data-dragging={dragHeight !== null || undefined}
      style={style}
      aria-label={label}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="nr-driver-sheet-grab"
        aria-label={snap === "expanded" ? "Collapse driver panel" : "Expand driver panel"}
        aria-expanded={snap === "expanded"}
        onClick={cycle}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={cancel}
      >
        <span aria-hidden="true" />
      </button>
      <div className="nr-driver-sheet-content">{children}</div>
    </section>
  );
}
