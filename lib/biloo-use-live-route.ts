'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { nexrideApiFetch } from './nexride-api-auth';
import { freshDriverFix, parseLiveJourneyRoute, type LiveJourneyRoute } from './biloo-journey';
import type { TripSnapshot } from './nexride-trip-data';

export function useLiveJourneyRoute(snapshot: TripSnapshot | null) {
  const latest = useRef(snapshot); latest.current = snapshot;
  const [route, setRoute] = useState<LiveJourneyRoute | null>(null);
  const [clock, setClock] = useState(0);
  const tripId = snapshot?.id, driverId = snapshot?.driver?.id, stage = snapshot?.status;
  const hasTracking = !!snapshot?.tracking;
  useEffect(() => {
    setRoute(null);
    if (!tripId || !driverId || !['approaching', 'in_trip'].includes(stage || '')) return;
    let stopped = false, pending = false, lastAttempt = 0;
    const controller = new AbortController();
    const update = async () => {
      const current = latest.current, now = Date.now();
      setClock(now);
      if (stopped || pending || document.visibilityState === 'hidden' || !navigator.onLine ||
        !current?.tracking || !freshDriverFix(current.tracking.updatedAt, now) ||
        now - lastAttempt < 15_000) return;
      pending = true; lastAttempt = now;
      try {
        const response = await nexrideApiFetch(`/api/rider/trips/${encodeURIComponent(tripId)}/route`, {
          cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
        });
        const body = await response.json();
        const next = response.ok && body.status === 'ready' ? parseLiveJourneyRoute(body.route) : null;
        if (!stopped) setRoute(next && next.tripId === tripId && next.driverId === driverId &&
          next.target === (stage === 'approaching' ? 'pickup' : 'destination') ? next : null);
      } catch { if (!stopped) setRoute(null); }
      finally { pending = false; }
    };
    void update();
    const timer = window.setInterval(() => void update(), 5000);
    const resume = () => { lastAttempt = 0; void update(); };
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      stopped = true; controller.abort(); window.clearInterval(timer);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [tripId, driverId, stage, hasTracking]);
  return useMemo(() => {
  if (!snapshot) return null;
  const fresh = route && snapshot.tracking && freshDriverFix(snapshot.tracking.updatedAt, clock) &&
    freshDriverFix(route.generatedAt, clock) && freshDriverFix(route.fixAt, clock) &&
    route.tripId === tripId && route.driverId === driverId &&
    route.target === (stage === 'approaching' ? 'pickup' : stage === 'in_trip' ? 'destination' : '');
  return fresh ? {
    ...snapshot,
    route: { id: `${tripId}:${route.target}:${route.generatedAt}`, points: route.points },
    tracking: { ...snapshot.tracking!, etaMinutes: route.durationSeconds / 60, etaUpdatedAt: route.generatedAt },
    metrics: { arrivalAt: route.generatedAt + route.durationSeconds * 1000,
      remainingMeters: route.distanceMeters, updatedAt: route.generatedAt },
  } : snapshot;
  }, [snapshot, route, clock, tripId, driverId, stage]);
}
