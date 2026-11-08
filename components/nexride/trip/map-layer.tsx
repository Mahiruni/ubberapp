'use client';

import { useEffect, useRef } from 'react';
import { LngLat, Path, clamp, easeOutBack, sliceTo } from './engine';
import type { Phase, TripSim } from './use-trip';

/** The slice of the Mapbox GL / MapLibre GL map API this layer needs. */
export interface MapLike {
  project(l: LngLat): { x: number; y: number };
  jumpTo(o: { center?: LngLat; zoom?: number; padding?: Padding }): unknown;
  fitBounds(b: [LngLat, LngLat], o?: { padding?: Padding; duration?: number; maxZoom?: number }): unknown;
  getBearing?(): number;
}
export interface Padding { top: number; bottom: number; left: number; right: number }

interface Props {
  map: MapLike;
  sim: TripSim;
  pickup: LngLat;
  destination: LngLat;
  /** Height in px of the bottom sheet, so the camera frames the route above it. */
  bottomInset?: number;
}

const NAVY = '#0f1f2e';
const EMERALD = '#10b981';

function strokePath(ctx: CanvasRenderingContext2D, map: MapLike, pts: LngLat[]) {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const s = map.project(p);
    if (i) ctx.lineTo(s.x, s.y);
    else ctx.moveTo(s.x, s.y);
  });
  ctx.stroke();
}

function drawRoute(ctx: CanvasRenderingContext2D, map: MapLike, path: Path, dist: number, color: string, w: number) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = w + 4;
  strokePath(ctx, map, path.pts);
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  strokePath(ctx, map, path.pts);
  if (dist > 0) {
    ctx.strokeStyle = '#a7b3bd';
    strokePath(ctx, map, sliceTo(path, dist));
  }
}

function drawPickup(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.shadowColor = 'rgba(15,31,46,.3)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x, y, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = EMERALD;
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fill();
}

function drawDestination(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.shadowColor = 'rgba(15,31,46,.3)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = NAVY;
  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#fff';
  ctx.fillRect(x - 4, y - 4, 8, 8);
}

function drawPulse(ctx: CanvasRenderingContext2D, x: number, y: number, now: number, still: boolean) {
  for (let i = 0; i < 3; i++) {
    const t = still ? 0.45 : (now / 2600 + i / 3) % 1;
    const r = 14 + t * 96;
    const a = (still ? 0.22 : 0.34) * (1 - t) ** 1.6;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(16,185,129,${a})`;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `rgba(16,185,129,${a * 1.6})`;
    ctx.stroke();
    if (still) break;
  }
}

function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, headingDeg: number, scale: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(16,185,129,.16)';
  ctx.beginPath();
  ctx.arc(0, 0, 27, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate((headingDeg * Math.PI) / 180);
  ctx.shadowColor = 'rgba(15,31,46,.4)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  const chevron = (tip: number, half: number, tail: number, notch: number) => {
    ctx.beginPath();
    ctx.moveTo(0, -tip);
    ctx.lineTo(half, tail);
    ctx.lineTo(0, notch);
    ctx.lineTo(-half, tail);
    ctx.closePath();
  };
  ctx.fillStyle = '#fff';
  ctx.lineJoin = 'round';
  chevron(20, 15, 16, 8);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = NAVY;
  chevron(14, 10, 11, 4);
  ctx.fill();
  ctx.restore();
}

export function MapLayer({ map, sim, pickup, destination, bottomInset = 300 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const simRef = useRef(sim);
  simRef.current = sim;
  const geo = useRef({ pickup, destination, bottomInset });
  geo.current = { pickup, destination, bottomInset };

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let dpr = 1;
    const resize = () => {
      const r = cv.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    resize();

    const pad = (): Padding => ({ top: 90, bottom: geo.current.bottomInset + 30, left: 50, right: 50 });
    const frameTo = (a: LngLat, b: LngLat, duration: number) =>
      map.fitBounds(
        [[Math.min(a[0], b[0]), Math.min(a[1], b[1])], [Math.max(a[0], b[0]), Math.max(a[1], b[1])]],
        { padding: pad(), duration: reduce ? 0 : duration, maxZoom: 16.5 },
      );

    let prev: Phase = 'idle';
    let last = performance.now();
    let raf = 0;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = simRef.current;
      s.tick(now, dt);
      const f = s.frame;
      const { pickup: pk, destination: ds } = geo.current;

      if (f.phase !== prev) {
        if (f.phase === 'searching') map.jumpTo({ center: pk, padding: { top: 0, bottom: geo.current.bottomInset, left: 0, right: 0 } });
        if (f.phase === 'enroute' && f.driverPath) frameTo(f.driverPath.pts[0], pk, 1000);
        if (f.phase === 'riding') frameTo(pk, ds, 1200);
        prev = f.phase;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      const bearing = map.getBearing?.() ?? 0;
      const showRoutes = f.phase !== 'idle' && f.phase !== 'cancelled';

      if (showRoutes && f.phase !== 'searching' && f.phase !== 'offers') {
        if (f.tripPath && (f.phase === 'riding' || f.phase === 'done')) drawRoute(ctx, map, f.tripPath, f.tripDist, EMERALD, 5);
        else if (f.driverPath) drawRoute(ctx, map, f.driverPath, f.driverDist, NAVY, 4);
      }

      const p = map.project(pk);
      if (f.phase === 'searching' || f.phase === 'offers') drawPulse(ctx, p.x, p.y, now, reduce);
      const d = map.project(ds);
      drawDestination(ctx, d.x, d.y);
      drawPickup(ctx, p.x, p.y);

      if (f.driver && (f.phase === 'enroute' || f.phase === 'arrived' || f.phase === 'riding')) {
        ctx.lineCap = 'round';
        ctx.lineWidth = 6;
        for (let i = 1; i < f.trail.length; i++) {
          const a = map.project(f.trail[i - 1]);
          const b = map.project(f.trail[i]);
          ctx.strokeStyle = `rgba(16,185,129,${(i / f.trail.length) * 0.35})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        const q = map.project(f.driver);
        const grow = reduce ? 1 : easeOutBack(clamp((now - f.appearedAt) / 550, 0, 1));
        drawArrow(ctx, q.x, q.y, f.heading - bearing, grow);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [map]);

  return <canvas ref={ref} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }} />;
}
