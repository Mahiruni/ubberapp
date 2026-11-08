"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { sheetHeight } from "../../lib/nexride-sheet-geometry";
import { useSheetMotion } from "./use-sheet-motion";

/** Every Driver sheet snaps to a quarter, a half or three quarters of the screen. */
export const DRIVER_SHEET_RATIOS = [0.25, 0.5, 0.75] as const;
export type DriverSheetSnap = "collapsed" | "medium" | "expanded";
const ORDER: readonly DriverSheetSnap[] = ["collapsed", "medium", "expanded"];

/**
 * Shared controller for Driver bottom sheets.
 * - Snaps: 25%, 50%, 75% (never taller than 75%).
 * - Until the Driver moves the handle, the sheet opens at the smallest snap
 *   that fits its content, and follows the content as it grows or shrinks.
 * - Once the Driver chooses a snap, that choice is kept.
 */
export function useDriverSheet(defaultSnap: DriverSheetSnap = "medium") {
  const panelRef = useRef<HTMLElement>(null);
  const userChose = useRef(false);
  const [ratio, setRatio] = useState<number>(DRIVER_SHEET_RATIOS[Math.max(0, ORDER.indexOf(defaultSnap))]);
  const motion = useSheetMotion({
    kind: "driver",
    ratios: DRIVER_SHEET_RATIOS,
    defaultRatio: ratio,
    ratio,
    onRatioChange: next => { userChose.current = true; setRatio(next); },
  });

  const fit = useCallback(() => {
    const panel = panelRef.current;
    if (!panel || userChose.current) return;
    const viewport = Math.max(1, window.visualViewport?.height || window.innerHeight);
    const grab = panel.querySelector<HTMLElement>(".nr-driver-sheet-grab");
    const content = panel.querySelector<HTMLElement>(".nr-driver-sheet-content");
    const footer = panel.querySelector<HTMLElement>(".nr-driver-sheet-footer");
    const needed = (grab?.offsetHeight ?? 36) + (content?.scrollHeight ?? 0) + (footer?.offsetHeight ?? 0) + 4;
    const next = DRIVER_SHEET_RATIOS.find(candidate => sheetHeight(candidate, viewport) >= needed) ?? DRIVER_SHEET_RATIOS[2];
    setRatio(previous => (previous === next ? previous : next));
  }, []);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(fit); };
    const resizer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    const watch = () => {
      resizer?.disconnect();
      panel.querySelectorAll(".nr-driver-sheet-content > *, .nr-driver-sheet-footer, .nr-driver-sheet-footer > *")
        .forEach(element => resizer?.observe(element));
    };
    watch();
    schedule();
    const mutations = new MutationObserver(() => { watch(); schedule(); });
    mutations.observe(panel, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      resizer?.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, [fit]);

  // Map controls and the guidance card sit above the sheet's real rendered height.
  useEffect(() => {
    const panel = panelRef.current, parent = panel?.parentElement;
    if (!panel || !parent) return;
    const sync = () => parent.style.setProperty("--nr-driver-sheet-actual-height", `${Math.ceil(panel.getBoundingClientRect().height)}px`);
    sync();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync);
    observer?.observe(panel);
    return () => { observer?.disconnect(); parent.style.removeProperty("--nr-driver-sheet-actual-height"); };
  }, []);

  const index = DRIVER_SHEET_RATIOS.findIndex(candidate => Math.abs(candidate - motion.currentRatio) < 0.005);
  return { panelRef, motion, snap: ORDER[Math.max(0, index)] };
}
