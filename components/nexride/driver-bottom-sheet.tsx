"use client";
import type { ReactNode } from "react";
import { useDriverSheet, type DriverSheetSnap } from "./use-driver-sheet";
import "../../app/wrapper-polish.css";

export function DriverBottomSheet({ children, className = "", label, defaultSnap = "medium", footer }: {
  children: ReactNode; className?: string; label: string; defaultSnap?: DriverSheetSnap;
  /** Pinned controls stay outside the scrollable detail body. */
  footer?: ReactNode;
}) {
  const { panelRef, motion, snap } = useDriverSheet(defaultSnap);
  return <section ref={panelRef} className={`nr-driver-sheet ${className}`.trim()}
    data-snap={snap} data-dragging={motion.dragging || undefined}
    aria-label={label} onPointerDown={event => event.stopPropagation()}>
    <button ref={motion.handleRef} type="button" className="nr-driver-sheet-grab"
      role="slider" aria-label="Resize driver panel" aria-orientation="vertical"
      aria-valuemin={25} aria-valuemax={75} aria-valuenow={Math.round(motion.currentRatio * 100)}
      {...motion.handleProps}><span aria-hidden="true" /></button>
    <div className="nr-driver-sheet-content">{children}</div>
    {footer != null && <div className="nr-driver-sheet-footer">{footer}</div>}
  </section>;
}
