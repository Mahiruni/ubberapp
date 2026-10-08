"use client";

import { useContext, useLayoutEffect, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Icon, LanguageContext } from "./ui";
import {
  clampSwipeOffset,
  isSwipeReleaseReady,
  isSwipeThumbHit,
  swipeTrackTravel,
} from "../../lib/nexride-driver-swipe";

type SwipeGesture = {
  pointerId: number;
  startX: number;
  startOffset: number;
  offset: number;
  moved: boolean;
};

/**
 * NexRide Driver availability is always server-confirmed by the caller.
 * Only a deliberate thumb drag or keyboard/assistive activation can initiate
 * the existing authenticated availability action.
 */
export function DriverAvailabilitySwipe({
  online,
  updating,
  disabled,
  labelOverride,
  onToggle,
}: {
  online: boolean;
  updating: boolean;
  disabled: boolean;
  labelOverride?: string;
  onToggle: () => void | Promise<void>;
}) {
  const language = useContext(LanguageContext);
  const say = (en: string, am: string) => language === "am" ? am : en;
  const trackRef = useRef<HTMLButtonElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const gestureRef = useRef<SwipeGesture | null>(null);
  const pendingRef = useRef(false);
  const maxRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const queuedRef = useRef(0);
  const latestRef = useRef({ online, updating, disabled });
  latestRef.current = { online, updating, disabled };

  const measure = () => {
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!track || !thumb) return 0;
    const travel = swipeTrackTravel(
      track.getBoundingClientRect().width,
      thumb.getBoundingClientRect().width,
    );
    maxRef.current = travel;
    return travel;
  };

  const paint = (offset: number) => {
    trackRef.current?.style.setProperty("--nr-swipe-x", `${clampSwipeOffset(offset, maxRef.current)}px`);
  };

  const cancelFrame = () => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  };

  const queuePaint = (offset: number) => {
    queuedRef.current = offset;
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      paint(queuedRef.current);
    });
  };

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const resize = () => {
      const max = measure();
      const gesture = gestureRef.current;
      if (gesture) {
        gesture.offset = clampSwipeOffset(gesture.offset, max);
        paint(gesture.offset);
      } else if (!pendingRef.current) {
        paint(latestRef.current.online ? max : 0);
      }
    };
    resize();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(track);
    if (thumbRef.current) observer?.observe(thumbRef.current);
    window.addEventListener("resize", resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      cancelFrame();
    };
  }, []);

  // Hold the thumb at the user's release point while the server confirms.
  // Only backend-confirmed online changes move it into the opposite resting position.
  useLayoutEffect(() => {
    if (updating || gestureRef.current) return;
    pendingRef.current = false;
    const track = trackRef.current;
    if (track) {
      track.dataset.pending = "false";
      track.dataset.ready = "false";
      track.dataset.dragging = "false";
    }
    cancelFrame();
    paint(online ? measure() : 0);
  }, [online, updating]);

  const down = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    if (disabled || updating || pendingRef.current || gestureRef.current) return;
    const thumb = thumbRef.current?.getBoundingClientRect();
    if (!thumb || !isSwipeThumbHit(event.clientX, thumb.left, thumb.width)) return;
    const max = measure();
    const startOffset = online ? max : 0;
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startOffset,
      offset: startOffset,
      moved: false,
    };
    event.currentTarget.dataset.dragging = "true";
    event.currentTarget.dataset.ready = "false";
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return null;
    const deltaX = event.clientX - gesture.startX;
    gesture.moved ||= Math.abs(deltaX) > 10;
    gesture.offset = clampSwipeOffset(gesture.startOffset + deltaX, maxRef.current);
    const ready = isSwipeReleaseReady(online, gesture.offset, maxRef.current, gesture.moved);
    event.currentTarget.dataset.ready = ready ? "true" : "false";
    queuePaint(gesture.offset);
    return ready;
  };

  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    updateGesture(event);
  };

  const resetGesture = () => {
    gestureRef.current = null;
    const track = trackRef.current;
    if (track) {
      track.dataset.dragging = "false";
      track.dataset.ready = "false";
    }
    cancelFrame();
    paint(latestRef.current.online ? measure() : 0);
  };

  const up = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const ready = updateGesture(event);
    const offset = gesture.offset;
    gestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    event.currentTarget.dataset.dragging = "false";
    event.currentTarget.dataset.ready = "false";
    cancelFrame();

    if (!ready) {
      paint(online ? measure() : 0);
      return;
    }
    pendingRef.current = true;
    event.currentTarget.dataset.pending = "true";
    paint(offset);
    if ("vibrate" in navigator) {
      try { navigator.vibrate(10); } catch { /* Haptics are optional. */ }
    }
    try {
      void Promise.resolve(onToggle()).catch(() => {
        pendingRef.current = false;
        if (trackRef.current) trackRef.current.dataset.pending = "false";
        paint(latestRef.current.online ? measure() : 0);
      });
    } catch {
      pendingRef.current = false;
      if (trackRef.current) trackRef.current.dataset.pending = "false";
      paint(latestRef.current.online ? measure() : 0);
    }
  };

  const cancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (gestureRef.current?.pointerId !== event.pointerId) return;
    resetGesture();
  };

  const activate = (event: ReactMouseEvent<HTMLButtonElement>) => {
    // Physical pointer clicks cannot toggle availability. Native keyboard
    // and assistive technology activation dispatch click with detail === 0.
    if (event.detail !== 0 || disabled || updating || pendingRef.current) return;
    void onToggle();
  };

  const label = updating
    ? online
      ? say("Going offline…", "ከመስመር ውጭ በመውጣት ላይ…")
      : say("Going online…", "ወደ መስመር በመግባት ላይ…")
    : labelOverride || (
      online
        ? say("Swipe left to go offline", "ከመስመር ውጭ ለመውጣት ወደ ግራ ያንሸራትቱ")
        : say("Swipe right to go online", "ወደ መስመር ለመግባት ወደ ቀኝ ያንሸራትቱ")
    );

  return (
    <button
      ref={trackRef}
      type="button"
      role="switch"
      aria-checked={online}
      aria-busy={updating}
      aria-description={say(
        "Drag the circular thumb to confirm. Press Enter or Space to activate with a keyboard.",
        "ለማረጋገጥ ክብ መቆጣጠሪያውን ያንሸራትቱ። በቁልፍ ሰሌዳ Enter ወይም Space ይጫኑ።",
      )}
      aria-label={online
        ? say("Driver online. Swipe left to go offline.", "አሽከርካሪው መስመር ላይ ነው። ከመስመር ውጭ ለመውጣት ወደ ግራ ያንሸራትቱ።")
        : say("Driver offline. Swipe right to go online.", "አሽከርካሪው ከመስመር ውጭ ነው። ወደ መስመር ለመግባት ወደ ቀኝ ያንሸራትቱ።")
      }
      className="nr-driver-availability-swipe"
      data-online={online ? "true" : "false"}
      data-updating={updating ? "true" : "false"}
      data-dragging="false"
      data-ready="false"
      data-pending="false"
      disabled={disabled || updating}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
      onLostPointerCapture={(event) => {
        if (gestureRef.current?.pointerId === event.pointerId) resetGesture();
      }}
      onClick={activate}
    >
      <span className="nr-driver-swipe-label" aria-hidden="true">
        <span className="nr-driver-swipe-instruction">{label}</span>
        <span className="nr-driver-swipe-release">{online
          ? say("Release to go offline", "ከመስመር ውጭ ለመውጣት ይልቀቁ")
          : say("Release to go online", "መስመር ላይ ለመግባት ይልቀቁ")}</span>
      </span>
      <span ref={thumbRef} className="nr-driver-swipe-thumb" aria-hidden="true">
        {updating ? <span className="nr-driver-swipe-spinner" /> : <Icon name={online ? "back" : "arrow"} size={21} />}
      </span>
    </button>
  );
}
