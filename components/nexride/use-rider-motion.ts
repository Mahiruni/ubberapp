'use client';

import { useEffect, useRef, useState } from 'react';
import { riderLocomotion, RIDER_WAVE_MS, type RiderMotionFix, type RiderPose } from '../../lib/biloo-rider-motion';

/** Own GPS controls locomotion; a new arrival or confirmed signal briefly raises a hand. */
export function useRiderMotion({ position, enabled = true, waveKey = '', arrivalKey = '', onboard = false }: {
  position?: RiderMotionFix | null; enabled?: boolean; waveKey?: string; arrivalKey?: string; onboard?: boolean;
}) {
  const previous = useRef<RiderMotionFix | null>(null);
  const [locomotion, setLocomotion] = useState<RiderPose>('idle');
  const [waving, setWaving] = useState(false);
  const seen = useRef(new Set<string>());
  useEffect(() => {
    if (!enabled || onboard) { previous.current = null; setLocomotion('idle'); return; }
    setLocomotion(riderLocomotion(previous.current, position || null));
    previous.current = position || null;
    // Stop after missing fixes rather than walking forever on a cached position.
    const timer = window.setTimeout(() => setLocomotion('idle'), 6000);
    return () => window.clearTimeout(timer);
  }, [position, enabled, onboard]);
  useEffect(() => {
    if (!enabled || onboard) { setWaving(false); return; }
    const keys = [waveKey && `signal:${waveKey}`, arrivalKey && `arrival:${arrivalKey}`].filter(Boolean);
    const changed = keys.some(key => !seen.current.has(key));
    keys.forEach(key => seen.current.add(key));
    if (seen.current.size > 30) seen.current = new Set(keys);
    setWaving(changed);
    if (!changed) return;
    const timer = window.setTimeout(() => setWaving(false), RIDER_WAVE_MS);
    return () => window.clearTimeout(timer);
  }, [waveKey, arrivalKey, enabled, onboard]);
  return enabled && !onboard && waving ? 'wave' : enabled && !onboard ? locomotion : 'idle';
}
