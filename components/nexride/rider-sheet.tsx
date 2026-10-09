"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

type RiderSheetHandleProps = {
  label: string;
  defaultRatio: number;
  snaps?: readonly [number, number, number];
  ratio?: number;
  onRatioChange?: (ratio: number) => void;
  scrollSelector?: string;
  storageKey?: string;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function RiderSheetHandle({
  label,
  defaultRatio,
  snaps = [0.28, 0.46, 0.75],
  ratio,
  onRatioChange,
  scrollSelector,
  storageKey,
}: RiderSheetHandleProps) {
  const handleRef = useRef<HTMLButtonElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const scheduledHeightRef = useRef(0);
  const ratioRef = useRef(ratio ?? defaultRatio);
  const draggingRef = useRef(false);
  const drag = useRef({
    startY: 0,
    startRatio: ratio ?? defaultRatio,
    lastY: 0,
    lastAt: 0,
    velocity: 0,
    moved: false,
  });
  const [currentRatio, setCurrentRatio] = useState(ratio ?? defaultRatio);

  const root = () =>
    handleRef.current?.closest<HTMLElement>(".rider-map-flow") || null;

  const viewportHeight = () =>
    Math.max(520, window.visualViewport?.height || window.innerHeight || 800);

  const paint = (nextRatio: number) => {
    const next = clamp(nextRatio, snaps[0], snaps[2]);
    ratioRef.current = next;
    const height = Math.max(
      120,
      Math.min(viewportHeight() * next, viewportHeight() - 140),
    );
    // Always paint the latest drag geometry. React state updates are batched
    // to the same animation frame instead of running on every pointer event.
    scheduledHeightRef.current = height;
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      root()?.style.setProperty("--nr-flow-sheet-height", `${scheduledHeightRef.current}px`);
      setCurrentRatio(ratioRef.current);
      frameRef.current = null;
    });
  };

  const settle = (nextRatio: number) => {
    const next = snaps.reduce((best, candidate) =>
      Math.abs(candidate - nextRatio) < Math.abs(best - nextRatio)
        ? candidate
        : best,
    );
    draggingRef.current = false;
    root()?.removeAttribute("data-sheet-dragging");
    paint(next);
    onRatioChange?.(next);
    if (storageKey) {
      try {
        sessionStorage.setItem(storageKey, String(next));
      } catch {}
    }
  };

  const begin = (clientY: number) => {
    const now = performance.now();
    drag.current = {
      startY: clientY,
      startRatio: ratioRef.current,
      lastY: clientY,
      lastAt: now,
      velocity: 0,
      moved: false,
    };
    draggingRef.current = true;
    root()?.setAttribute("data-sheet-dragging", "true");
  };

  const move = (clientY: number) => {
    if (!draggingRef.current) return;
    const now = performance.now();
    const elapsed = Math.max(1, now - drag.current.lastAt);
    drag.current.velocity = -(clientY - drag.current.lastY) / elapsed;
    drag.current.lastY = clientY;
    drag.current.lastAt = now;

    const deltaRatio =
      (drag.current.startY - clientY) / viewportHeight();
    if (Math.abs(clientY - drag.current.startY) > 5)
      drag.current.moved = true;

    const raw = drag.current.startRatio + deltaRatio;
    const min = snaps[0];
    const max = snaps[2];
    const resisted =
      raw < min
        ? min + (raw - min) * 0.16
        : raw > max
          ? max + (raw - max) * 0.16
          : raw;
    paint(resisted);
  };

  const finish = () => {
    if (!draggingRef.current) return;
    const projected = clamp(
      ratioRef.current +
        (drag.current.velocity * 170) / viewportHeight(),
      snaps[0],
      snaps[2],
    );
    settle(projected);
  };

  useEffect(() => {
    let next = ratio ?? defaultRatio;
    if (ratio === undefined && storageKey) {
      try {
        const saved = sessionStorage.getItem(storageKey);
        if (saved !== null) {
          const stored = Number(saved);
          if (Number.isFinite(stored)) next = clamp(stored, snaps[0], snaps[2]);
        }
      } catch {}
    }
    ratioRef.current = next;
    paint(next);

    const resize = () => paint(ratioRef.current);
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      root()?.removeAttribute("data-sheet-dragging");
    };
    // Ratios for a mounted screen are intentionally stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ratio === undefined || draggingRef.current) return;
    paint(ratio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratio]);

  useEffect(() => {
    if (!scrollSelector) return;
    const section = handleRef.current?.closest<HTMLElement>(
      ".nr-rider-home-sheet,.nr-destination-panel,.nr-ride-selection,.nr-driver-matching,.nr-trip-experience",
    );
    const scroller = section?.querySelector<HTMLElement>(scrollSelector);
    if (!scroller) return;

    let touchId = -1;
    let startY = 0;
    let handedToSheet = false;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      touchId = touch.identifier;
      startY = touch.clientY;
      handedToSheet = false;
    };

    const onTouchMove = (event: TouchEvent) => {
      const touch = Array.from(event.touches).find(
        (item) => item.identifier === touchId,
      );
      if (!touch) return;
      const downward = touch.clientY - startY;
      if (!handedToSheet && scroller.scrollTop <= 1 && downward > 8) {
        handedToSheet = true;
        begin(startY);
        drag.current.moved = true;
      }
      if (!handedToSheet) return;
      event.preventDefault();
      move(touch.clientY);
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!handedToSheet) return;
      event.preventDefault();
      handedToSheet = false;
      finish();
    };

    scroller.addEventListener("touchstart", onTouchStart, { passive: true });
    scroller.addEventListener("touchmove", onTouchMove, { passive: false });
    scroller.addEventListener("touchend", onTouchEnd, { passive: false });
    scroller.addEventListener("touchcancel", onTouchEnd, { passive: false });
    return () => {
      scroller.removeEventListener("touchstart", onTouchStart);
      scroller.removeEventListener("touchmove", onTouchMove);
      scroller.removeEventListener("touchend", onTouchEnd);
      scroller.removeEventListener("touchcancel", onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollSelector]);

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    begin(event.clientY);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    move(event.clientY);
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    finish();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const ordered = [...snaps].sort((a, b) => a - b);
    const nearestIndex = ordered.reduce(
      (best, candidate, index) =>
        Math.abs(candidate - ratioRef.current) <
        Math.abs(ordered[best] - ratioRef.current)
          ? index
          : best,
      0,
    );

    if (event.key === "ArrowUp") {
      event.preventDefault();
      settle(ordered[Math.min(ordered.length - 1, nearestIndex + 1)]);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      settle(ordered[Math.max(0, nearestIndex - 1)]);
    } else if (event.key === "Home") {
      event.preventDefault();
      settle(ordered[0]);
    } else if (event.key === "End") {
      event.preventDefault();
      settle(ordered[ordered.length - 1]);
    }
  };

  return (
    <button
      ref={handleRef}
      type="button"
      className="nr-flow-sheet-handle"
      aria-label={label}
      role="slider"
      aria-valuemin={Math.round(snaps[0] * 100)}
      aria-valuemax={Math.round(snaps[2] * 100)}
      aria-valuenow={Math.round(currentRatio * 100)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={() => finish()}
      onKeyDown={onKeyDown}
    >
      <span aria-hidden="true" />
    </button>
  );
}
