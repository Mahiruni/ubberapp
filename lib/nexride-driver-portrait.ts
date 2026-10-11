'use client';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
export const DRIVER_PHOTO_BUCKET = 'nexride-driver-photos';
type State = { url: string; loading: boolean; stale: boolean; exists: boolean };
type Entry = { state: State; listeners: Set<(s: State) => void>; refresh: () => Promise<void>; stop: () => void };
const entries = new Map<string, Entry>();
const empty: State = { url: '', loading: true, stale: false, exists: false };
function entryFor(id: string): Entry {
  const existing = entries.get(id); if (existing) return existing;
  let stopped = false, revision = 0;
  const entry: Entry = { state: empty, listeners: new Set(), refresh: async () => {}, stop: () => {} };
  const publish = (state: State) => { entry.state = state; entry.listeners.forEach(listener => listener(state)); };
  entry.refresh = async () => {
    const request = ++revision;
    if (!navigator.onLine) { publish({ ...entry.state, loading: false, stale: true }); return; }
    try {
      const { data, error } = await supabase.from('driver_profile_photos').select('storage_path').eq('driver_id', id).eq('status', 'approved').maybeSingle();
      if (error) throw error;
      let url = '';
      if (data?.storage_path) {
        const result = await supabase.storage.from(DRIVER_PHOTO_BUCKET).createSignedUrl(data.storage_path, 300);
        if (result.error) throw result.error;
        url = result.data.signedUrl;
      }
      if (!stopped && request === revision) publish({ url, loading: false, stale: false, exists: !!data?.storage_path });
    } catch { if (!stopped && request === revision) publish({ ...entry.state, loading: false, stale: true }); }
  };
  const refresh = () => { void entry.refresh(); };
  const offline = () => publish({ ...entry.state, stale: true });
  const channel = supabase.channel(`driver-portrait:${id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'driver_profile_photos', filter: `driver_id=eq.${id}` }, refresh)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'driver_profile_photos', filter: `driver_id=eq.${id}` }, refresh)
    .subscribe(status => { if (status === 'SUBSCRIBED') refresh(); else if (['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)) offline(); });
  const timer = window.setInterval(refresh, 240_000);
  window.addEventListener('online', refresh); window.addEventListener('offline', offline); window.addEventListener('focus', refresh);
  const { data: auth } = supabase.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') { ++revision; publish({ url: '', loading: false, stale: false, exists: false }); }
    else if (event === 'SIGNED_IN') window.setTimeout(refresh, 0);
  });
  entry.stop = () => {
    stopped = true; ++revision; clearInterval(timer); auth.subscription.unsubscribe(); void supabase.removeChannel(channel);
    window.removeEventListener('online', refresh); window.removeEventListener('offline', offline); window.removeEventListener('focus', refresh);
    entries.delete(id);
  };
  entries.set(id, entry); refresh(); return entry;
}
export function refreshDriverPortrait(id: string) { return entries.get(id)?.refresh(); }
export function useDriverPortrait(id?: string | null) {
  const [snapshot, setSnapshot] = useState<{ id: string | null | undefined; state: State }>({ id, state: empty });
  useEffect(() => {
    const setState = (state: State) => setSnapshot({ id, state });
    setState(empty); if (!id) { setState({ url: '', loading: false, stale: false, exists: false }); return; }
    const entry = entryFor(id); setState(entry.state); entry.listeners.add(setState);
    return () => { entry.listeners.delete(setState); if (!entry.listeners.size) entry.stop(); };
  }, [id]);
  return { ...(snapshot.id === id ? snapshot.state : empty), refresh: () => id ? refreshDriverPortrait(id) : undefined };
}
export const validateDriverPhoto = (file: Pick<File, 'size' | 'type'>) =>
  !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ? 'photoInvalidType'
  : !Number.isFinite(file.size) || file.size <= 0 || file.size > 5 * 1024 * 1024 ? 'photoInvalidSize' : null;
export function portraitCrop(width: number, height: number, zoom: number, x: number, y: number) {
  const side = Math.min(width, height) / zoom;
  return { side, x: (width-side) * (x+100)/200, y: (height-side) * (y+100)/200 };
}
export async function cleanupRetiredPortraits(paths: string[]) {
  if (!paths.length) return true;
  const { error } = await supabase.storage.from(DRIVER_PHOTO_BUCKET).remove(paths); return !error;
}
