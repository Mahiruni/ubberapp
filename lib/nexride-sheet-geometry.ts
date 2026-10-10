export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Follow the visible viewport, including landscape and an open keyboard. */
export function sheetHeight(ratio: number, viewport: number) {
  const available = Math.max(1, viewport - 72);
  return clamp(viewport * ratio, Math.min(180, available * 0.55), available);
}

export function nearestSheetRatio(height: number, viewport: number, ratios: readonly number[]) {
  return ratios.reduce((best, ratio) => Math.abs(sheetHeight(ratio, viewport) - height) < Math.abs(sheetHeight(best, viewport) - height) ? ratio : best);
}

export function projectedSheetHeight(height: number, velocity: number, idleMs: number) {
  // Paused gestures release where they rest; flicks have bounded travel.
  return height + (idleMs > 80 ? 0 : clamp(velocity * 160, -160, 160));
}
