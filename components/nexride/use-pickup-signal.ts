'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { nexrideApiFetch } from '../../lib/nexride-api-auth';
import { normalizeMapAvatar, type MapAvatar } from '../../lib/biloo-rider-avatar-art';
import { freshPickupSignal, PICKUP_SIGNAL_TTL_MS } from '../../lib/biloo-rider-motion';

export type PickupSignal = { id: string; createdAt: string };
export function pickupSignal(value: unknown): PickupSignal | null {
  const v = value as Partial<PickupSignal> | null;
  return v && typeof v.id === 'string' && typeof v.createdAt === 'string' && freshPickupSignal(v.createdAt) ? { id: v.id, createdAt: v.createdAt } : null;
}

/** RLS-protected chat event wakes a scoped API read, with foreground recovery polling. */
export function usePickupSignal(tripId: string, enabled: boolean) {
  const [state, setState] = useState<{ tripId: string; avatar: MapAvatar; signal: PickupSignal | null } | null>(null);
  useEffect(() => {
    if (!state?.signal) return;
    const signal = state.signal;
    const timer = window.setTimeout(() => setState(current => current?.signal?.id === signal.id ? { ...current, signal: null } : current), Math.max(0, Date.parse(signal.createdAt) + PICKUP_SIGNAL_TTL_MS - Date.now()));
    return () => window.clearTimeout(timer);
  }, [state?.signal?.id, state?.signal?.createdAt]);
  useEffect(() => {
    setState(null);
    if (!tripId || !enabled) return;
    const controller = new AbortController();
    let active = true, pending = false, timer = 0;
    const refresh = async () => {
      if (!active || pending || document.hidden || !navigator.onLine) return;
      pending = true;
      try {
        const response = await nexrideApiFetch(`/api/trips/${encodeURIComponent(tripId)}/pickup-signal`, { cache: 'no-store', signal: controller.signal });
        if (!active) return;
        if ([401, 403, 404, 409].includes(response.status)) { setState(null); return; }
        if (!response.ok) throw new Error('unavailable');
        const data = await response.json();
        if (active && data.status === 'ready') setState({ tripId, avatar: normalizeMapAvatar(data.avatar), signal: pickupSignal(data.signal) });
      } catch {
        if (active) setState(current => current ? { ...current, signal: pickupSignal(current.signal) } : null);
      } finally { pending = false; }
    };
    const wake = () => { void refresh(); };
    const schedule = () => {
      window.clearTimeout(timer);
      if (!document.hidden) { wake(); timer = window.setTimeout(schedule, 10_000); }
    };
    const channel = supabase.channel(`biloo-pickup:${tripId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_chat_messages', filter: `ride_request_id=eq.${tripId}` }, wake)
      .subscribe(status => { if (status === 'SUBSCRIBED') wake(); });
    const { data: auth } = supabase.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') { setState(null); if (event === 'SIGNED_OUT') { active = false; controller.abort(); } } });
    schedule();
    window.addEventListener('online', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('biloo:pickup-signal-sent', wake);
    document.addEventListener('visibilitychange', schedule);
    return () => {
      active = false; controller.abort(); window.clearTimeout(timer);
      void supabase.removeChannel(channel); auth.subscription.unsubscribe();
      window.removeEventListener('online', wake); window.removeEventListener('focus', wake);
      window.removeEventListener('biloo:pickup-signal-sent', wake); document.removeEventListener('visibilitychange', schedule);
    };
  }, [tripId, enabled]);
  return enabled && state?.tripId === tripId ? state : null;
}
