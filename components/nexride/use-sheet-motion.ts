"use client";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { clamp, nearestSheetRatio, projectedSheetHeight, sheetHeight } from "../../lib/nexride-sheet-geometry";

type Options = {
  kind: "rider" | "driver"; ratios: readonly [number, number, number]; defaultRatio: number;
  ratio?: number; onRatioChange?: (ratio: number) => void; storageKey?: string;
};

/** All panels share a handle-only gesture controller. Body scrolling stays native. */
export function useSheetMotion(options: Options) {
  const config = useRef(options);
  config.current = options;
  const handleRef = useRef<HTMLButtonElement>(null);
  const ratioRef = useRef(options.ratio ?? options.defaultRatio);
  const frame = useRef<number | null>(null);
  const pendingHeight = useRef(0);
  const suppressClickUntil = useRef(0);
  const gesture = useRef<null | { pointer: number; startY: number; startHeight: number; height: number; lastY: number; lastAt: number; velocity: number; moved: boolean }>(null);
  const [currentRatio, setCurrentRatio] = useState(ratioRef.current);
  const [dragging, setDragging] = useState(false);
  const viewport = () => Math.max(1, window.visualViewport?.height || window.innerHeight);
  const host = () => handleRef.current?.closest<HTMLElement>(config.current.kind === "rider" ? ".rider-map-flow" : ".nr-driver-sheet");
  const surface = () => handleRef.current?.closest<HTMLElement>(config.current.kind === "rider" ? ".nr-rider-flow-panel" : ".nr-driver-sheet");
  const variable = () => config.current.kind === "rider" ? "--nr-flow-sheet-height" : "--nr-driver-sheet-height";
  const stopFrame = () => { if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null; };
  const paint = (height: number) => {
    pendingHeight.current = height;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      host()?.style.setProperty(variable(), `${pendingHeight.current}px`);
      if (handleRef.current?.getAttribute("role") === "slider") handleRef.current.setAttribute("aria-valuenow", String(Math.round(pendingHeight.current / viewport() * 100)));
    });
  };
  const markDragging = (active: boolean) => {
    const attribute = config.current.kind === "rider" ? "data-sheet-dragging" : "data-dragging";
    if (active) host()?.setAttribute(attribute, "true"); else host()?.removeAttribute(attribute);
    setDragging(active);
  };
  const settle = (ratio: number, notify = true) => {
    stopFrame();
    const { ratios, storageKey, onRatioChange } = config.current;
    const next = clamp(ratio, ratios[0], ratios[2]);
    ratioRef.current = next;
    host()?.style.setProperty(variable(), `${sheetHeight(next, viewport())}px`);
    setCurrentRatio(next);
    if (notify) {
      onRatioChange?.(next);
      if (storageKey) { try { sessionStorage.setItem(storageKey, String(next)); } catch { /* Optional persistence. */ } }
    }
  };
  const end = (cancelled = false) => {
    const active = gesture.current;
    if (!active) return;
    // Clear first: releasing capture also dispatches lostpointercapture.
    gesture.current = null;
    if (active.moved) suppressClickUntil.current = performance.now() + 400;
    markDragging(false);
    const projected = cancelled ? active.height : projectedSheetHeight(active.height, active.velocity, performance.now() - active.lastAt);
    settle(nearestSheetRatio(projected, viewport(), config.current.ratios));
  };
  useEffect(() => {
    let next = config.current.ratio ?? config.current.defaultRatio;
    if (config.current.ratio === undefined && config.current.storageKey) {
      try { const saved = sessionStorage.getItem(config.current.storageKey); if (saved !== null && Number.isFinite(Number(saved))) next = Number(saved); } catch { /* Optional persistence. */ }
    }
    settle(next, false);
    const resize = () => { gesture.current = null; markDragging(false); settle(ratioRef.current, false); };
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    const element = host(), property = variable(), kind = config.current.kind;
    return () => {
      stopFrame();
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      element?.removeAttribute(kind === "rider" ? "data-sheet-dragging" : "data-dragging");
      element?.style.removeProperty(property);
    };
    // A mounted screen owns its initial snap. Controlled changes are below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (options.ratio !== undefined && !gesture.current) settle(options.ratio, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.ratio]);
  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0) || gesture.current) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    const height = surface()?.getBoundingClientRect().height || sheetHeight(ratioRef.current, viewport());
    gesture.current = { pointer: event.pointerId, startY: event.clientY, startHeight: height, height, lastY: event.clientY, lastAt: performance.now(), velocity: 0, moved: false };
    // Freeze a settling animation at its rendered position, avoiding a jump.
    markDragging(true); stopFrame();
    host()?.style.setProperty(variable(), `${height}px`);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    const now = performance.now(), elapsed = now - active.lastAt;
    const instant = (active.lastY - event.clientY) / Math.max(1, elapsed);
    active.velocity = elapsed > 80 ? instant : active.velocity * 0.65 + instant * 0.35;
    active.lastY = event.clientY; active.lastAt = now;
    const delta = active.startY - event.clientY;
    active.moved ||= Math.abs(delta) > 5;
    if (!active.moved) return;
    const { ratios } = config.current;
    active.height = clamp(active.startHeight + delta, sheetHeight(ratios[0], viewport()), sheetHeight(ratios[2], viewport()));
    paint(active.height);
  };
  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (gesture.current?.pointer !== event.pointerId) return;
    event.stopPropagation(); end(event.type === "pointercancel");
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onClick = () => {
    if (performance.now() < suppressClickUntil.current) return;
    const ratios = config.current.ratios;
    const nearest = nearestSheetRatio(sheetHeight(ratioRef.current, viewport()), viewport(), ratios);
    settle(ratios[(ratios.indexOf(nearest) + 1) % ratios.length]);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const ratios = config.current.ratios;
    const index = ratios.indexOf(nearestSheetRatio(sheetHeight(ratioRef.current, viewport()), viewport(), ratios));
    const next = event.key === "ArrowUp" ? ratios[Math.min(2, index + 1)] : event.key === "ArrowDown" ? ratios[Math.max(0, index - 1)] : event.key === "Home" ? ratios[0] : event.key === "End" ? ratios[2] : null;
    if (next !== null) { event.preventDefault(); settle(next); }
  };
  return { handleRef, currentRatio, dragging, handleProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onLostPointerCapture: () => end(true), onClick, onKeyDown } };
}
