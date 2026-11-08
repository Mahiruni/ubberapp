export type LngLat = [number, number];

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function distance(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function bearing(a: LngLat, b: LngLat): number {
  const p1 = rad(a[1]);
  const p2 = rad(b[1]);
  const dl = rad(b[0] - a[0]);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export function destination(from: LngLat, brg: number, meters: number): LngLat {
  const d = meters / R;
  const t = rad(brg);
  const p1 = rad(from[1]);
  const l1 = rad(from[0]);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [deg(l2), deg(p2)];
}

export interface Path {
  pts: LngLat[];
  cum: number[];
  total: number;
}

export function buildPath(pts: LngLat[]): Path {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + distance(pts[i - 1], pts[i]));
  return { pts, cum, total: cum[cum.length - 1] };
}

export function pointAt(p: Path, d: number): LngLat {
  if (d <= 0) return p.pts[0];
  if (d >= p.total) return p.pts[p.pts.length - 1];
  let lo = 0;
  let hi = p.cum.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (p.cum[m] <= d) lo = m;
    else hi = m;
  }
  const seg = p.cum[hi] - p.cum[lo] || 1;
  const t = (d - p.cum[lo]) / seg;
  const a = p.pts[lo];
  const b = p.pts[hi];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Heading from a look-ahead window so the arrow turns into corners early, like a nav app. */
export function headingAt(p: Path, d: number, look = 30): number {
  const s = Math.min(d, Math.max(0, p.total - look));
  return bearing(pointAt(p, s), pointAt(p, Math.min(p.total, s + look)));
}

export function sliceTo(p: Path, d: number): LngLat[] {
  if (d <= 0) return [p.pts[0]];
  const out: LngLat[] = [];
  for (let i = 0; i < p.pts.length && p.cum[i] < d; i++) out.push(p.pts[i]);
  out.push(pointAt(p, d));
  return out;
}

export function curvedPath(a: LngLat, b: LngLat, bend = 0.2, n = 48): LngLat[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const c: LngLat = [(a[0] + b[0]) / 2 - dy * bend, (a[1] + b[1]) / 2 + dx * bend];
  const out: LngLat[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return out;
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const easeOutBack = (t: number) => {
  const c = 1.70158;
  const x = clamp(t, 0, 1) - 1;
  return 1 + (c + 1) * x ** 3 + c * x ** 2;
};

export const angleDelta = (from: number, to: number) => ((to - from + 540) % 360) - 180;

/** Frame-rate independent exponential smoothing of an angle (degrees). */
export function smoothAngle(cur: number, target: number, dt: number, tau = 0.16): number {
  const next = cur + angleDelta(cur, target) * (1 - Math.exp(-dt / tau));
  return (next + 360) % 360;
}

/** Accelerates smoothly, cruises, then brakes so the car eases to a stop exactly at the end. */
export function stepSpeed(v: number, remaining: number, dt: number, vmax: number, accel: number): number {
  const brake = Math.sqrt(2 * accel * Math.max(0, remaining));
  const target = Math.min(vmax, brake);
  const dv = clamp(target - v, -accel * 1.5 * dt, accel * dt);
  return Math.max(vmax * 0.06, v + dv);
}
