'use client';

/** Tile-less stand-in map for the demo page and tests. Real screens pass their Mapbox/MapLibre instance instead. */
import { useEffect, useRef, useState } from 'react';
import type { LngLat } from './engine';
import type { MapLike, Padding } from './map-layer';

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const world = (l: LngLat, z: number) => {
  const s = 512 * 2 ** z;
  return { x: ((l[0] + 180) / 360) * s, y: ((1 - Math.log(Math.tan(Math.PI / 4 + rad(l[1]) / 2)) / Math.PI) / 2) * s };
};
const unworld = (x: number, y: number, z: number): LngLat => {
  const s = 512 * 2 ** z;
  return [(x / s) * 360 - 180, deg(Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / s))))];
};

export class FlatMap implements MapLike {
  center: LngLat;
  zoom: number;
  w = 0;
  h = 0;
  pad: Padding = { top: 0, bottom: 0, left: 0, right: 0 };
  private raf = 0;
  constructor(center: LngLat, zoom: number) {
    this.center = center;
    this.zoom = zoom;
  }
  project(l: LngLat) {
    const c = world(this.center, this.zoom);
    const p = world(l, this.zoom);
    return {
      x: p.x - c.x + this.w / 2 + (this.pad.left - this.pad.right) / 2,
      y: p.y - c.y + this.h / 2 + (this.pad.top - this.pad.bottom) / 2,
    };
  }
  jumpTo(o: { center?: LngLat; zoom?: number; padding?: Padding }) {
    cancelAnimationFrame(this.raf);
    if (o.center) this.center = o.center;
    if (o.zoom !== undefined) this.zoom = o.zoom;
    if (o.padding) this.pad = o.padding;
  }
  fitBounds(b: [LngLat, LngLat], o: { padding?: Padding; duration?: number; maxZoom?: number } = {}) {
    const pad = o.padding ?? { top: 0, bottom: 0, left: 0, right: 0 };
    const a = world(b[0], 0);
    const c = world(b[1], 0);
    const dx = Math.abs(c.x - a.x) || 1e-6;
    const dy = Math.abs(c.y - a.y) || 1e-6;
    const z = Math.min(
      o.maxZoom ?? 17,
      Math.log2(Math.min((this.w - pad.left - pad.right) / dx, (this.h - pad.top - pad.bottom) / dy)),
    );
    const to = unworld((a.x + c.x) / 2 * 2 ** 0, (a.y + c.y) / 2, 0);
    const from = { c: this.center, z: this.zoom };
    this.pad = pad;
    const dur = o.duration ?? 0;
    const t0 = performance.now();
    cancelAnimationFrame(this.raf);
    const step = (now: number) => {
      const t = dur ? Math.min(1, (now - t0) / dur) : 1;
      const e = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
      this.center = [from.c[0] + (to[0] - from.c[0]) * e, from.c[1] + (to[1] - from.c[1]) * e];
      this.zoom = from.z + (z - from.z) * e;
      if (t < 1) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
  getBearing() {
    return 0;
  }
}

export function useFlatMap(center: LngLat, zoom = 15.4) {
  const [map] = useState(() => new FlatMap(center, zoom));
  return map;
}

/** Draws a plain street grid behind the trip layer. */
export function FlatMapBackdrop({ map }: { map: FlatMap }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== Math.round(r.width * dpr)) {
        cv.width = Math.round(r.width * dpr);
        cv.height = Math.round(r.height * dpr);
      }
      map.w = r.width;
      map.h = r.height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#e9eeea';
      ctx.fillRect(0, 0, r.width, r.height);
      const step = 0.0021;
      const tl = unworld(world(map.center, map.zoom).x - r.width, world(map.center, map.zoom).y - r.height, map.zoom);
      const br = unworld(world(map.center, map.zoom).x + r.width, world(map.center, map.zoom).y + r.height, map.zoom);
      ctx.strokeStyle = '#fff';
      ctx.lineCap = 'butt';
      for (let i = Math.floor(tl[0] / step); i <= Math.ceil(br[0] / step); i++) {
        const a = map.project([i * step, tl[1]]);
        const b = map.project([i * step, br[1]]);
        ctx.lineWidth = i % 4 === 0 ? 9 : 5;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      for (let j = Math.floor(br[1] / step); j <= Math.ceil(tl[1] / step); j++) {
        const a = map.project([tl[0], j * step]);
        const b = map.project([br[0], j * step]);
        ctx.lineWidth = j % 4 === 0 ? 9 : 5;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [map]);
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />;
}
