"use client";
import { useSheetMotion } from "./use-sheet-motion";

type RiderSheetHandleProps = {
  label: string; defaultRatio: number; snaps?: readonly [number, number, number];
  ratio?: number; onRatioChange?: (ratio: number) => void;
  scrollSelector?: string; storageKey?: string;
};
const DEFAULT_SNAPS = [0.28, 0.46, 0.75] as const;
export function RiderSheetHandle({ label, defaultRatio, snaps = DEFAULT_SNAPS,
  ratio, onRatioChange, storageKey }: RiderSheetHandleProps) {
  const motion = useSheetMotion({ kind: "rider", ratios: snaps, defaultRatio, ratio, onRatioChange, storageKey });
  return <button ref={motion.handleRef} type="button" className="nr-flow-sheet-handle"
    role="slider" aria-label={label} aria-orientation="vertical"
    aria-valuemin={Math.round(snaps[0] * 100)} aria-valuemax={Math.round(snaps[2] * 100)}
    aria-valuenow={Math.round(motion.currentRatio * 100)}
    {...motion.handleProps}><span aria-hidden="true" /></button>;
}
