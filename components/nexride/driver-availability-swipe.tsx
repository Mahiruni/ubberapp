"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Icon, LanguageContext } from "./ui";
import { useContext } from "react";

export function DriverAvailabilitySwipe({
  online,
  updating,
  disabled,
  onToggle,
}: {
  online: boolean;
  updating: boolean;
  disabled: boolean;
  onToggle: () => void | Promise<void>;
}) {
  const language = useContext(LanguageContext);
  const say = (en: string, am: string) => (language === "am" ? am : en);
  const trackRef = useRef<HTMLButtonElement | null>(null);
  const draggingRef = useRef(false);
  const draggedRef = useRef(false);
  const suppressClickRef = useRef(false);
  const maxOffsetRef = useRef(0);
  const [dragOffset, setDragOffset] = useState<number | null>(null);

  useEffect(() => {
    if (!updating) setDragOffset(null);
  }, [online, updating]);

  const measure = () => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const thumb = Math.min(58, Math.max(52, rect.height - 8));
    return Math.max(0, rect.width - thumb - 8);
  };

  const pointerOffset = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const track = trackRef.current;
    if (!track) return online ? maxOffsetRef.current : 0;
    const rect = track.getBoundingClientRect();
    const thumb = Math.min(58, Math.max(52, rect.height - 8));
    return Math.max(
      0,
      Math.min(
        maxOffsetRef.current,
        event.clientX - rect.left - thumb / 2 - 4,
      ),
    );
  };

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled || updating) return;
    maxOffsetRef.current = measure();
    draggingRef.current = true;
    draggedRef.current = false;
    setDragOffset(online ? maxOffsetRef.current : 0);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current) return;
    const offset = pointerOffset(event);
    const start = online ? maxOffsetRef.current : 0;
    if (Math.abs(offset - start) > 5) draggedRef.current = true;
    setDragOffset(offset);
  };

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const offset = pointerOffset(event);
    const max = Math.max(1, maxOffsetRef.current);
    const progress = offset / max;
    const completed = online ? progress <= 0.28 : progress >= 0.72;
    setDragOffset(null);

    if (completed) {
      suppressClickRef.current = true;
      if ("vibrate" in navigator) {
        try { navigator.vibrate(10); } catch {}
      }
      void onToggle();
    }
  };

  const cancelDrag = () => {
    draggingRef.current = false;
    setDragOffset(null);
  };

  const activate = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (disabled || updating || draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    void onToggle();
  };

  const label = updating
    ? online
      ? say("Going offline…", "ከመስመር ውጭ በመውጣት ላይ…")
      : say("Going online…", "ወደ መስመር በመግባት ላይ…")
    : online
      ? say("Swipe left to go offline", "ከመስመር ውጭ ለመውጣት ወደ ግራ ያንሸራትቱ")
      : say("Swipe right to go online", "ወደ መስመር ለመግባት ወደ ቀኝ ያንሸራትቱ");

  return (
    <button
      ref={trackRef}
      type="button"
      role="switch"
      aria-checked={online}
      aria-label={
        online
          ? say("Driver online. Swipe or activate to go offline.", "አሽከርካሪው መስመር ላይ ነው። ከመስመር ውጭ ለመውጣት ያንሸራትቱ ወይም ያግብሩ።")
          : say("Driver offline. Swipe or activate to go online.", "አሽከርካሪው ከመስመር ውጭ ነው። ወደ መስመር ለመግባት ያንሸራትቱ ወይም ያግብሩ።")
      }
      className="nr-driver-availability-swipe"
      data-online={online ? "true" : "false"}
      data-updating={updating ? "true" : "false"}
      data-dragging={dragOffset !== null ? "true" : "false"}
      disabled={disabled || updating}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={finishDrag}
      onPointerCancel={cancelDrag}
      onClick={activate}
    >
      <span className="nr-driver-swipe-label" aria-hidden="true">{label}</span>
      <span
        className="nr-driver-swipe-thumb"
        aria-hidden="true"
        style={
          dragOffset === null
            ? undefined
            : { left: "4px", transform: `translate3d(${dragOffset}px,0,0)` }
        }
      >
        {updating ? (
          <span className="nr-driver-swipe-spinner" />
        ) : (
          <Icon name={online ? "back" : "arrow"} size={20} />
        )}
      </span>
    </button>
  );
}
