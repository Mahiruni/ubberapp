'use client';

import { useEffect, useRef, useState } from 'react';
import {
  LngLat, Path, bearing, buildPath, curvedPath, destination, headingAt, pointAt, smoothAngle, stepSpeed, distance,
} from './engine';

export type Phase = 'idle' | 'searching' | 'offers' | 'enroute' | 'arrived' | 'riding' | 'done' | 'cancelled';

export interface Offer {
  id: string;
  name: string;
  rating: number;
  car: string;
  plate: string;
  price: number;
  etaMin: number;
  ttl: number;
  expiresAt: number;
}

/** Mutable render state read every animation frame by the map layer. Never triggers React renders. */
export interface Frame {
  phase: Phase;
  driver: LngLat | null;
  heading: number;
  appearedAt: number;
  driverPath: Path | null;
  driverDist: number;
  tripPath: Path | null;
  tripDist: number;
  trail: LngLat[];
}

export interface TripOptions {
  pickup: LngLat;
  destination: LngLat;
  /** Road geometry pickup -> destination (e.g. from /api/rider/route). Falls back to a curve. */
  route?: LngLat[];
  initialFare?: number;
  approachSeconds?: number;
  tripSeconds?: number;
  /** Road geometry for the driver's approach. Falls back to a curve. */
  getRoute?: (from: LngLat, to: LngLat) => Promise<LngLat[]>;
}

const SAMPLE_DRIVERS = [
  { name: 'Dawit T.', rating: 4.9, car: 'Toyota Vitz, white', plate: 'AA 2-48213' },
  { name: 'Meron A.', rating: 4.8, car: 'Suzuki Dzire, silver', plate: 'AA 3-10577' },
  { name: 'Yonas B.', rating: 4.7, car: 'Hyundai i10, blue', plate: 'AA 2-77340' },
  { name: 'Selam G.', rating: 4.9, car: 'Toyota Corolla, black', plate: 'AA 3-65128' },
  { name: 'Abel K.', rating: 4.6, car: 'Suzuki Alto, red', plate: 'AA 2-30954' },
];

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const round5 = (n: number) => Math.round(n / 5) * 5;
const REAL_MPS = 11; // ETA basis (about 40 km/h)

export function useTripSim(o: TripOptions) {
  const opts = useRef(o);
  opts.current = o;

  const [phase, setPhase] = useState<Phase>('idle');
  const [fare, setFareState] = useState(o.initialFare ?? 120);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [driver, setDriver] = useState<Offer | null>(null);
  const [ui, setUi] = useState({ remaining: 0, total: 0, etaMin: 0 });

  const [frame] = useState<Frame>(() => ({
    phase: 'idle', driver: null, heading: 0, appearedAt: 0,
    driverPath: null, driverDist: 0, tripPath: null, tripDist: 0, trail: [],
  }));

  const phaseRef = useRef<Phase>('idle');
  const offersRef = useRef<Offer[]>([]);
  const fareRef = useRef(fare);
  const timers = useRef<number[]>([]);
  const runId = useRef(0);
  const speed = useRef(0);
  const lastUi = useRef(0);
  const offerCount = useRef(0);

  function go(p: Phase) {
    phaseRef.current = p;
    frame.phase = p;
    setPhase(p);
  }
  function later(fn: () => void, ms: number) {
    timers.current.push(window.setTimeout(fn, ms));
  }
  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }
  function commit(list: Offer[]) {
    offersRef.current = list;
    setOffers(list);
    if (!list.length && phaseRef.current === 'offers') {
      go('searching');
      if (offerCount.current < 8) later(addOffer, 2200);
    } else if (list.length && phaseRef.current === 'searching') {
      go('offers');
    }
  }
  function addOffer() {
    if (phaseRef.current !== 'searching' && phaseRef.current !== 'offers') return;
    const s = SAMPLE_DRIVERS[offerCount.current++ % SAMPLE_DRIVERS.length];
    const ttl = 20;
    const delta = [-10, 0, 10, 20][Math.floor(Math.random() * 4)];
    commit([
      ...offersRef.current,
      {
        ...s,
        id: `o${offerCount.current}-${Date.now()}`,
        price: Math.max(50, round5(fareRef.current + delta)),
        etaMin: Math.round(rnd(2, 6)),
        ttl,
        expiresAt: performance.now() + ttl * 1000,
      },
    ]);
  }
  function resetFrame() {
    frame.driver = null;
    frame.driverPath = null;
    frame.tripPath = null;
    frame.driverDist = 0;
    frame.tripDist = 0;
    frame.trail = [];
    speed.current = 0;
  }
  function stop(next: Phase) {
    runId.current++;
    clearTimers();
    offersRef.current = [];
    setOffers([]);
    setDriver(null);
    resetFrame();
    go(next);
  }

  function setFare(v: number) {
    const n = Math.max(50, Math.round(v));
    fareRef.current = n;
    setFareState(n);
  }
  function request() {
    stop('idle');
    offerCount.current = 0;
    go('searching');
    [1800, 3400, 5200].forEach((ms) => later(addOffer, ms));
  }
  function decline(id: string) {
    commit(offersRef.current.filter((x) => x.id !== id));
  }
  async function accept(id: string) {
    const picked = offersRef.current.find((x) => x.id === id);
    if (!picked) return;
    const run = ++runId.current;
    clearTimers();
    offersRef.current = [];
    setOffers([]);
    setDriver(picked);
    const { pickup, getRoute } = opts.current;
    const start = destination(pickup, rnd(0, 360), rnd(650, 1000));
    let pts: LngLat[];
    try {
      pts = getRoute ? await getRoute(start, pickup) : curvedPath(start, pickup, rnd(-0.25, 0.25));
    } catch {
      pts = curvedPath(start, pickup, 0.2);
    }
    if (run !== runId.current) return;
    const path = buildPath(pts);
    frame.driverPath = path;
    frame.driverDist = 0;
    frame.driver = pts[0];
    frame.heading = headingAt(path, 0);
    frame.appearedAt = performance.now();
    frame.trail = [];
    speed.current = 0;
    go('enroute');
  }
  function startTrip() {
    const { pickup, destination: dst, route } = opts.current;
    const pts = route && route.length > 1 ? route : curvedPath(pickup, dst, 0.15, 64);
    frame.tripPath = buildPath(pts);
    frame.tripDist = 0;
    frame.trail = [];
    speed.current = 0;
    go('riding');
  }

  function tick(now: number, dt: number) {
    if (offersRef.current.some((x) => x.expiresAt <= now)) commit(offersRef.current.filter((x) => x.expiresAt > now));

    const p = phaseRef.current;
    if (p !== 'enroute' && p !== 'riding') return;
    const enroute = p === 'enroute';
    const path = enroute ? frame.driverPath : frame.tripPath;
    if (!path) return;

    const secs = enroute ? opts.current.approachSeconds ?? 18 : opts.current.tripSeconds ?? 28;
    const vmax = Math.max(1, path.total / (secs * 0.8));
    let d = enroute ? frame.driverDist : frame.tripDist;
    speed.current = stepSpeed(speed.current, path.total - d, dt, vmax, vmax / 2.2);
    d = Math.min(path.total, d + speed.current * dt);
    if (enroute) frame.driverDist = d;
    else frame.tripDist = d;

    const pos = pointAt(path, d);
    frame.driver = pos;
    frame.heading = smoothAngle(frame.heading, headingAt(path, d, Math.min(40, Math.max(15, path.total * 0.03))), dt);
    const last = frame.trail[frame.trail.length - 1];
    if (!last || distance(last, pos) > Math.max(3, path.total / 200)) {
      frame.trail.push(pos);
      if (frame.trail.length > 36) frame.trail.shift();
    }

    if (now - lastUi.current > 250) {
      lastUi.current = now;
      const remaining = path.total - d;
      setUi({ remaining, total: path.total, etaMin: Math.max(1, Math.ceil(remaining / REAL_MPS / 60)) });
    }

    if (path.total - d < 0.5) {
      speed.current = 0;
      setUi({ remaining: 0, total: path.total, etaMin: 0 });
      if (enroute) {
        go('arrived');
        later(startTrip, 3200);
      } else {
        go('done');
      }
    }
  }

  useEffect(() => () => {
    runId.current++;
    clearTimers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    phase, offers, driver, fare, ui, frame,
    setFare, request, accept, decline, tick,
    cancel: () => stop('cancelled'),
    reset: () => stop('idle'),
  };
}

export type TripSim = ReturnType<typeof useTripSim>;
export { bearing };
