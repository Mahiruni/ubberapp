'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { mergeTrip, type TripSnapshot } from '../../lib/nexride-trip-data';
import { readRiderTrip, sendTripMessage, submitRiderRating } from '../../lib/nexride-trip-service';
import type { PreviewTrip } from '../../lib/nexride-preview';
import type { RiderScreen } from './rider';
export function TripExperience({ screen, tripId, userId, preview, navigate, setPreview, safety }: {
  screen: 'trip' | 'live' | 'summary'; tripId: string | null; userId: string | null; preview: PreviewTrip | null;
  navigate: (s: RiderScreen) => void; setPreview: (p: PreviewTrip) => void; safety: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null), latest = useRef<TripSnapshot | null>(null), ready = useRef(false);
  const callbacks = useRef({ navigate, setPreview, safety, preview }); callbacks.current = { navigate, setPreview, safety, preview };
  const [connection, setConnection] = useState('Loading trip…');
  const file = screen === 'summary' ? 'completion.html' : screen === 'live' ? 'trip.html' : 'index.html';
  const live = !!tripId && !!userId;
  const openSafety = () => {
    try {
      const snapshot = latest.current;
      const context = snapshot ? {
        id: snapshot.id,
        status: snapshot.status,
        pickup: snapshot.pickup.name || "",
        destination: snapshot.destination.name || "",
        category: snapshot.category || "",
      } : preview ? {
        id: tripId || "preview",
        status: screen === "live" ? "in_trip" : "approaching",
        pickup: preview.pickup,
        destination: preview.destination,
        category: preview.ride,
      } : null;
      if (context) sessionStorage.setItem("nexride.safety.trip", JSON.stringify(context));
    } catch {}
    callbacks.current.safety();
  };
  useEffect(() => {
    let stopped = false, pending = false, revision = 0, connected = false;
    ready.current = false; latest.current = null;
    const send = (message: unknown) => frame.current?.contentWindow?.postMessage(message, window.location.origin);
    const publish = () => { if (ready.current && latest.current) send({ type: 'nexride:snapshot', snapshot: latest.current }); };
    const announce = (value: boolean) => { connected = value; if (!stopped) { setConnection(value ? 'Trip updates connected' : 'Connection lost · last received trip details'); if (ready.current) send({ type: 'nexride:connection', connected: value }); } };
    const refresh = async () => {
      if (stopped || pending || !tripId || !userId) return;
      if (!navigator.onLine) { announce(false); return; }
      pending = true;
      try {
        const next = await readRiderTrip(tripId, userId, ++revision); if (stopped) return;
        latest.current = mergeTrip(latest.current, next); publish(); announce(true);
        if (next.status === 'in_trip' && screen === 'trip') callbacks.current.navigate('live');
        if (next.status === 'completed' && screen !== 'summary') callbacks.current.navigate('summary');
      } catch { if (!stopped) announce(false); } finally { pending = false; }
    };
    const receive = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || !event.data || typeof event.data !== 'object') return;
      const message = event.data;
      if (message.type === 'nexride:ready') {
        send({ type: 'nexride:initialize', live, tripId, preview: live ? null : callbacks.current.preview }); return;
      }
      if (message.type === 'nexride:subscribed') { ready.current = true; publish(); if (live) send({ type: 'nexride:connection', connected }); return; }
      if (message.type === 'nexride:open-chat' && live && tripId) {
        window.location.assign('/trip/chat?ride=' + encodeURIComponent(tripId) + '&role=rider');
        return;
      }
      if (message.type === 'nexride:preview-rating' && !live && callbacks.current.preview && Number.isInteger(message.score) && message.score >= 1 && message.score <= 5) {
        callbacks.current.setPreview({ ...callbacks.current.preview, rating: message.score }); return;
      }
      if (message.type !== 'nexride:request' || !live || !tripId || typeof message.requestId !== 'string') return;
      // Only presentation actions are exposed. Authentication credentials stay in this app.
      try {
        const input = message.input;
        if (!input || (input.bookingId ?? input.tripId) !== tripId) throw Error('Invalid trip');
        let result: unknown;
        if (message.method === 'submitRating') result = await submitRiderRating(input);
        else if (message.method === 'sendMessage') result = await sendTripMessage(input);
        else throw Error('This service is not connected');
        if (!stopped) { send({ type: 'nexride:response', requestId: message.requestId, result }); void refresh(); }
      } catch { if (!stopped) send({ type: 'nexride:response', requestId: message.requestId, error: 'Action could not be confirmed. Please retry.' }); }
    };
    window.addEventListener('message', receive);
    const offline = () => announce(false), online = () => void refresh();
    window.addEventListener('offline', offline); window.addEventListener('online', online);
    let channel: ReturnType<typeof supabase.channel> | null = null;
    if (live && tripId) {
      channel = supabase
        .channel(`rider-trip:${tripId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ride_requests', filter: `id=eq.${tripId}` }, () => void refresh())
        .subscribe(status => {
          if (['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)) announce(false);
          if (status === 'SUBSCRIBED') void refresh();
        });
      void refresh();
    }
    const interval = live ? setInterval(() => void refresh(), 5000) : null;
    return () => { stopped = true; ready.current = false; window.removeEventListener('message', receive); window.removeEventListener('offline', offline); window.removeEventListener('online', online); if (interval) clearInterval(interval); if (channel) void supabase.removeChannel(channel); };
  }, [tripId, userId, live, file, screen]);
  if (tripId && !userId) return <section className="nr-trip-experience"><p role="status">Sign in to view this trip.</p><button onClick={() => navigate("home")}>Back to home</button></section>;
  return <section className="nr-trip-experience" aria-label={screen === 'summary' ? 'Trip receipt and rating' : 'Your trip'}>
    <div className="nr-trip-toolbar">
      <button onClick={() => window.location.assign('/rider/trips')}>All trips</button>
      <span role="status">{live ? connection : 'Design preview · sample ride'}</span>
      {screen !== 'summary' && <button onClick={openSafety}>Safety</button>}
      {!live && screen !== 'summary' && <button onClick={() => { if (screen === 'live' && preview) setPreview({ ...preview, completed: true }); navigate(screen === 'trip' ? 'live' : 'summary'); }}>{screen === 'trip' ? 'Start preview trip' : 'Complete preview trip'}</button>}
    </div>
    <iframe ref={frame} key={`${file}:${tripId || 'preview'}`} className="nr-trip-frame" title={screen === 'summary' ? 'NexRide trip receipt and rating' : screen === 'live' ? 'NexRide active trip' : 'NexRide assigned driver'}
      onLoad={() => frame.current?.contentWindow?.postMessage({ type: 'nexride:ping' }, window.location.origin)}
      src={`/nexride/screens/${file}?embedded=1${live ? '&live=1' : ''}`} allow="web-share; clipboard-write" />
  </section>;
}
