'use client';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { PHOTO_SOURCE_MAX_BYTES } from './nexride-photo-processing';
export { portraitCrop } from './nexride-photo-processing';
export const DRIVER_PHOTO_BUCKET = 'nexride-driver-photos';
type State = { url: string; loading: boolean; stale: boolean; exists: boolean };
type Entry = { state: State; listeners: Set<(s: State) => void>; refresh: () => Promise<void>; stop: () => void; releaseTimer: number | null };
const entries = new Map<string, Entry>();
const empty: State = { url: '', loading: true, stale: false, exists: false };
function entryFor(id: string): Entry {
  const existing = entries.get(id); if (existing) return existing;
  let stopped = false, revision = 0, refreshing = false, lastSuccessfulRefresh = 0;
  const entry: Entry = { state: empty, listeners: new Set(), refresh: async () => {}, stop: () => {}, releaseTimer: null };
  const publish = (state: State) => { entry.state = state; entry.listeners.forEach(listener => listener(state)); };
  entry.refresh = async () => {
    if (refreshing || stopped) return;
    refreshing = true;
    const request = ++revision;
    if (!navigator.onLine) { publish({ ...entry.state, loading: false, stale: true }); refreshing = false; return; }
    try {
      const { data, error } = await supabase.from('driver_profile_photos').select('storage_path').eq('driver_id', id).eq('status', 'approved').maybeSingle();
      if (error) throw error;
      let url = '';
      if (data?.storage_path) {
        const result = await supabase.storage.from(DRIVER_PHOTO_BUCKET).createSignedUrl(data.storage_path, 300);
        if (result.error) throw result.error;
        url = result.data.signedUrl;
      }
      if (!stopped && request === revision) {
        lastSuccessfulRefresh = Date.now();
        publish({ url, loading: false, stale: false, exists: !!data?.storage_path });
      }
    } catch { if (!stopped && request === revision) publish({ ...entry.state, loading: false, stale: true }); }
    finally { refreshing = false; }
  };
  const refresh = () => { void entry.refresh(); };
  const offline = () => publish({ ...entry.state, stale: true });
  const channel = supabase.channel(`driver-portrait:${id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'driver_profile_photos', filter: `driver_id=eq.${id}` }, refresh)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'driver_profile_photos', filter: `driver_id=eq.${id}` }, refresh)
    .subscribe(status => { if (status === 'SUBSCRIBED' && Date.now() - lastSuccessfulRefresh > 30_000) refresh(); else if (['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)) offline(); });
  const timer = window.setInterval(refresh, 240_000);
  window.addEventListener('online', refresh); window.addEventListener('offline', offline); window.addEventListener('focus', refresh);
  const { data: auth } = supabase.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') { ++revision; publish({ url: '', loading: false, stale: false, exists: false }); }
    else if (event === 'SIGNED_IN') window.setTimeout(refresh, 0);
  });
  entry.stop = () => {
    stopped = true; ++revision;
    if (entry.releaseTimer !== null) window.clearTimeout(entry.releaseTimer);
    clearInterval(timer); auth.subscription.unsubscribe(); void supabase.removeChannel(channel);
    window.removeEventListener('online', refresh); window.removeEventListener('offline', offline); window.removeEventListener('focus', refresh);
    entries.delete(id);
  };
  entries.set(id, entry); refresh(); return entry;
}
export function refreshDriverPortrait(id: string) { return entries.get(id)?.refresh(); }
export function useDriverPortrait(id?: string | null) {
  const [snapshot, setSnapshot] = useState<{ id: string | null | undefined; state: State }>({ id, state: id ? entries.get(id)?.state || empty : empty });
  useEffect(() => {
    const setState = (state: State) => setSnapshot({ id, state });
    if (!id) { setState({ url: '', loading: false, stale: false, exists: false }); return; }
    const entry = entryFor(id);
    if (entry.releaseTimer !== null) { window.clearTimeout(entry.releaseTimer); entry.releaseTimer = null; }
    setState(entry.state);
    entry.listeners.add(setState);
    return () => {
      entry.listeners.delete(setState);
      if (!entry.listeners.size) {
        // Keep one approved image and channel briefly between internal pages.
        // Cleanup after idle to avoid repeated signed URL reads during tab switches.
        entry.releaseTimer = window.setTimeout(() => { if (!entry.listeners.size) entry.stop(); }, 20_000);
      }
    };
  }, [id]);
  return { ...(snapshot.id === id ? snapshot.state : empty), refresh: () => id ? refreshDriverPortrait(id) : undefined };
}
export const validateDriverPhoto = (file: Pick<File, 'size' | 'type'>) =>
  !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ? 'photoInvalidType'
  : !Number.isFinite(file.size) || file.size <= 0 || file.size > PHOTO_SOURCE_MAX_BYTES ? 'photoInvalidSize' : null;
export async function cleanupRetiredPortraits(paths: string[]) {
  if (!paths.length) return true;
  const { error } = await supabase.storage.from(DRIVER_PHOTO_BUCKET).remove(paths); return !error;
}
