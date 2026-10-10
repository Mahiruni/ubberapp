"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { useSheetMotion } from "./use-sheet-motion";
import "../../app/wrapper-polish.css";

type DriverSheetSnap = "collapsed" | "medium" | "expanded";
const RATIOS = [0.34, 0.55, 0.82] as const;
const ORDER: DriverSheetSnap[] = ["collapsed", "medium", "expanded"];
export function DriverBottomSheet({ children, className = "", label, defaultSnap = "medium", footer }: {
  children: ReactNode; className?: string; label: string; defaultSnap?: DriverSheetSnap;
  /** Pinned controls stay outside the scrollable detail body. */
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const motion = useSheetMotion({ kind: "driver", ratios: RATIOS, defaultRatio: RATIOS[ORDER.indexOf(defaultSnap)] });
  const index = RATIOS.findIndex(r => r === motion.currentRatio);
  useEffect(() => {
    const panel = panelRef.current, parent = panel?.parentElement;
    if (!panel || !parent) return;
    const sync = () => parent.style.setProperty("--nr-driver-sheet-actual-height", `${Math.ceil(panel.getBoundingClientRect().height)}px`);
    sync();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync);
    observer?.observe(panel);
    return () => { observer?.disconnect(); parent.style.removeProperty("--nr-driver-sheet-actual-height"); };
  }, []);
  return <section ref={panelRef} className={`nr-driver-sheet ${className}`.trim()}
    data-snap={ORDER[Math.max(0, index)]} data-dragging={motion.dragging || undefined}
    aria-label={label} onPointerDown={event => event.stopPropagation()}>
    <button ref={motion.handleRef} type="button" className="nr-driver-sheet-grab"
      role="slider" aria-label="Resize driver panel" aria-orientation="vertical"
      aria-valuemin={34} aria-valuemax={82} aria-valuenow={Math.round(motion.currentRatio * 100)}
      {...motion.handleProps}><span aria-hidden="true" /></button>
    <div className="nr-driver-sheet-content">{children}</div>
    {footer != null && <div className="nr-driver-sheet-footer">{footer}</div>}
  </section>;
}
