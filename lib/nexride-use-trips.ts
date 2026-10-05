'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { isActiveTrip, riderTripList } from './nexride-trip-service';
import { ALERTS_KEY } from './nexride-account';
import type { Row } from './nexride-trip-data';
export function useRiderTrips() {
  const [userId, setUserId] = useState<string | null>(null), [rows, setRows] = useState<Row[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(false);
  const identity = useRef(userId); identity.current = userId;
  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => { if (alive) { setUserId(data.session?.user.id || null); if (!data.session) setLoading(false); } });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { if (alive) { setRows([]); setUserId(session?.user.id || null); setLoading(!!session); setError(false); } });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);
  const refresh = useCallback(async () => {
    if (!userId) return;
    try { const next = await riderTripList(userId); if (identity.current === userId) { setRows(next); setError(false); } } catch { if (identity.current === userId) setError(true); } finally { if (identity.current === userId) setLoading(false); }
  }, [userId]);
  useEffect(() => {
    if (!userId) return;
    let stopped = false, pending = false;
    let previous: Map<string, string> | null = null;
    const accept = (next: Row[]) => {
      if (previous && next.some(row => previous!.has(String(row.id)) && previous!.get(String(row.id)) !== String(row.state))) {
        let enabled = true; try { enabled = localStorage.getItem(ALERTS_KEY) !== 'off'; } catch {}
        if (enabled) window.dispatchEvent(new Event('nexride:trip-alert'));
      }
      previous = new Map(next.map(row => [String(row.id), String(row.state)]));
      setRows(next); setError(false);
    };
    const load = async () => { if (stopped || pending) return; pending = true; try { const next = await riderTripList(userId); if (!stopped) accept(next); } catch { if (!stopped) setError(true); } finally { pending = false; if (!stopped) setLoading(false); } };
    void load();
    const channel = supabase.channel(`rider-trips:${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'ride_requests', filter: `rider_id=eq.${userId}` }, () => void load()).subscribe();
    const interval = setInterval(() => void load(), 15000);
    return () => { stopped = true; clearInterval(interval); void supabase.removeChannel(channel); };
  }, [userId]);
  return { userId, rows, loading, error, refresh, active: rows.find(isActiveTrip) || null };
}
