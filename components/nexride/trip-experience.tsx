'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { mergeTrip, type TripSnapshot } from '../../lib/nexride-trip-data';
import { readRiderTrip, sendTripMessage, submitRiderRating } from '../../lib/nexride-trip-service';
import { emitNexRideFeedback } from '../../lib/nexride-feedback';
import type { PreviewTrip } from '../../lib/nexride-preview';
import type { RiderScreen } from './rider';
import { RiderSheetHandle } from './rider-sheet';

const cacheKey = (tripId: string) => `nexride.trip.cache.${tripId}`;
const readCachedTrip = (tripId: string): TripSnapshot | null => {
  try {
    const raw = localStorage.getItem(cacheKey(tripId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; snapshot?: TripSnapshot };
    if (!parsed.snapshot || !parsed.savedAt || Date.now() - parsed.savedAt > 12 * 60 * 60 * 1000) return null;
    return parsed.snapshot;
  } catch {
    return null;
  }
};
const writeCachedTrip = (tripId: string, snapshot: TripSnapshot) => {
  try {
    localStorage.setItem(cacheKey(tripId), JSON.stringify({ savedAt: Date.now(), snapshot }));
  } catch {}
};

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
    let failures = 0, pollTimer: number | null = null, reconnectTimer: number | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    ready.current = false;
    latest.current = tripId ? readCachedTrip(tripId) : null;
    let feedbackStatus = latest.current?.status || "";

    const send = (message: unknown) => frame.current?.contentWindow?.postMessage(message, window.location.origin);
    const publish = () => { if (ready.current && latest.current) send({ type: 'nexride:snapshot', snapshot: latest.current }); };
    const announce = (value: boolean, message?: string) => {
      connected = value;
      if (stopped) return;
      setConnection(message || (value ? 'Trip updates are live' : 'Reconnecting… showing the latest saved trip details'));
      if (ready.current) send({ type: 'nexride:connection', connected: value });
    };

    const nextPollDelay = () => {
      const saver = document.documentElement.hasAttribute('data-nr-data-saver');
      if (!navigator.onLine) return 30_000;
      if (failures > 0) return Math.min(30_000, 2_000 * 2 ** Math.min(failures, 4));
      return saver ? 15_000 : 5_000;
    };
    const schedulePoll = () => {
      if (pollTimer) window.clearTimeout(pollTimer);
      if (!live || stopped) return;
      pollTimer = window.setTimeout(() => void refresh(), nextPollDelay());
    };

    const refresh = async () => {
      if (stopped || pending || !tripId || !userId) return;
      if (!navigator.onLine) {
        announce(false, latest.current ? 'You’re offline · showing the last confirmed trip update' : 'You’re offline · trip updates will resume automatically');
        schedulePoll();
        return;
      }
      pending = true;
      try {
        const next = await readRiderTrip(tripId, userId, ++revision);
        if (stopped) return;
        if (feedbackStatus && next.status && next.status !== feedbackStatus) {
          const event =
            next.status === "arrived" ? "driver_arrived"
            : next.status === "in_trip" ? "trip_started"
            : next.status === "completed" ? "trip_completed"
            : next.status === "cancelled" ? "cancelled"
            : null;
          if (event) {
            emitNexRideFeedback({
              event,
              id: `${tripId}:${next.status}`,
              title:
                next.status === "arrived" ? "Your driver is here"
                : next.status === "in_trip" ? "Trip started"
                : next.status === "completed" ? "Trip completed"
                : "Ride cancelled",
              body:
                next.status === "arrived" ? "Your NexRide driver has arrived at the pickup point."
                : next.status === "in_trip" ? "Your NexRide trip is now in progress."
                : next.status === "completed" ? "You’ve arrived. Your trip is complete."
                : "This ride is no longer active.",
              url: "/",
            });
          }
        }
        feedbackStatus = next.status || feedbackStatus;
        latest.current = mergeTrip(latest.current, next);
        writeCachedTrip(tripId, latest.current);
        failures = 0;
        publish();
        announce(true);
        if (next.status === 'in_trip' && screen === 'trip') callbacks.current.navigate('live');
        if (next.status === 'completed' && screen !== 'summary') callbacks.current.navigate('summary');
      } catch {
        failures += 1;
        if (!stopped) announce(false, 'Reconnecting… showing the latest saved trip details');
      } finally {
        pending = false;
        schedulePoll();
      }
    };

    const subscribe = () => {
      if (stopped || !live || !tripId) return;
      if (channel) void supabase.removeChannel(channel);
      channel = supabase
        .channel(`rider-trip:${tripId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ride_requests', filter: `id=eq.${tripId}` }, () => void refresh())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_driver_locations', filter: `ride_request_id=eq.${tripId}` }, () => void refresh())
        .subscribe(status => {
          if (status === 'SUBSCRIBED') {
            failures = 0;
            void refresh();
            return;
          }
          if (['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)) {
            announce(false);
            if (reconnectTimer) window.clearTimeout(reconnectTimer);
            const delay = Math.min(30_000, 1_500 * 2 ** Math.min(failures++, 4));
            reconnectTimer = window.setTimeout(subscribe, delay);
          }
        });
    };

    const receive = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || !event.data || typeof event.data !== 'object') return;
      const message = event.data;
      if (message.type === 'nexride:ready') {
        send({ type: 'nexride:initialize', live, tripId, preview: live ? null : callbacks.current.preview });
        return;
      }
      if (message.type === 'nexride:subscribed') {
        ready.current = true;
        publish();
        if (live) send({ type: 'nexride:connection', connected });
        return;
      }
      if (message.type === 'nexride:open-chat' && live && tripId) {
        window.location.assign('/trip/chat?ride=' + encodeURIComponent(tripId) + '&role=rider');
        return;
      }
      if (message.type === 'nexride:preview-rating' && !live && callbacks.current.preview && Number.isInteger(message.score) && message.score >= 1 && message.score <= 5) {
        callbacks.current.setPreview({ ...callbacks.current.preview, rating: message.score });
        return;
      }
      if (message.type !== 'nexride:request' || !live || !tripId || typeof message.requestId !== 'string') return;
      try {
        const input = message.input;
        if (!input || (input.bookingId ?? input.tripId) !== tripId) throw Error('Invalid trip');
        let result: unknown;
        if (message.method === 'submitRating') result = await submitRiderRating(input);
        else if (message.method === 'sendMessage') result = await sendTripMessage(input);
        else throw Error('This service is not connected');
        if (!stopped) {
          send({ type: 'nexride:response', requestId: message.requestId, result });
          void refresh();
        }
      } catch {
        if (!stopped) send({ type: 'nexride:response', requestId: message.requestId, error: 'Action could not be confirmed. Please retry.' });
      }
    };

    window.addEventListener('message', receive);
    const offline = () => {
      announce(false, latest.current ? 'You’re offline · showing the last confirmed trip update' : 'You’re offline · trip updates will resume automatically');
      schedulePoll();
    };
    const online = () => {
      announce(false, 'Reconnecting…');
      failures = 0;
      subscribe();
      void refresh();
    };
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);

    if (latest.current) {
      setConnection(navigator.onLine ? 'Restoring latest trip…' : 'You’re offline · showing the last confirmed trip update');
      publish();
    }
    if (live && tripId) {
      subscribe();
      void refresh();
    }

    return () => {
      stopped = true;
      ready.current = false;
      window.removeEventListener('message', receive);
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      if (pollTimer) window.clearTimeout(pollTimer);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [tripId, userId, live, file, screen]);

  if (tripId && !userId) return <section className="nr-trip-experience"><p role="status">Sign in to view this trip.</p><button onClick={() => navigate("home")}>Back to home</button></section>;
  const defaultRatio = screen === 'summary' ? 0.66 : screen === 'live' ? 0.46 : 0.52;
  const snaps = screen === 'summary'
    ? [0.32, 0.66, 0.75] as const
    : screen === 'live'
      ? [0.28, 0.46, 0.72] as const
      : [0.28, 0.52, 0.75] as const;

  return <section className="nr-trip-experience" aria-label={screen === 'summary' ? 'Trip receipt and rating' : 'Your trip'}>
    <RiderSheetHandle
      label={screen === 'summary' ? 'Resize trip summary panel' : screen === 'live' ? 'Resize active trip panel' : 'Resize driver panel'}
      defaultRatio={defaultRatio}
      snaps={snaps}
      storageKey={`nexride.rider.sheet.${screen}`}
    />
    <div className="nr-trip-toolbar">
      <button onClick={() => window.location.assign('/rider/trips')}>Activity</button>
      <span role="status" aria-live="polite">{live ? connection : 'Preview ride'}</span>
      {screen !== 'summary' && <button onClick={openSafety}>Safety</button>}
      {!live && screen !== 'summary' && <button onClick={() => { if (screen === 'live' && preview) setPreview({ ...preview, completed: true }); navigate(screen === 'trip' ? 'live' : 'summary'); }}>{screen === 'trip' ? 'Start trip' : 'Complete trip'}</button>}
    </div>
    <iframe
      ref={frame}
      key={`${file}:${tripId || 'preview'}`}
      className="nr-trip-frame"
      title={screen === 'summary' ? 'NexRide trip receipt and rating' : screen === 'live' ? 'NexRide active trip' : 'NexRide assigned driver'}
      onLoad={() => frame.current?.contentWindow?.postMessage({ type: 'nexride:ping' }, window.location.origin)}
      src={`/nexride/screens/${file}?embedded=1${live ? '&live=1' : ''}`}
      allow="web-share; clipboard-write"
    />
  </section>;
}
