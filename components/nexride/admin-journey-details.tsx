'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Button, Dialog, Icon } from './ui';

type Ride = Record<string, unknown>;
type Offer = { id: string; driver_id: string; status: string; created_at: string; expires_at: string | null; accepted_at: string | null };
type Event = { id: number; event_type: string; actor_id: string | null; recorded_at: string };
const time = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('en-ET', { timeZone: 'Africa/Addis_Ababa', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
const money = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? `${value.toLocaleString('en-ET', { maximumFractionDigits: 2 })} ETB` : 'Not confirmed';

export function AdminJourneyDetails({ rideId, onClose }: { rideId: string; onClose: () => void }) {
  const [ride, setRide] = useState<Ride | null>(null), [offers, setOffers] = useState<Offer[]>([]);
  const [events, setEvents] = useState<Event[]>([]), [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(true), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setBusy(true); setErrors([]);
    void (async () => {
      // Use the caller's authenticated RLS client. No service-role access or
      // exact GPS fixes/contact details are exposed by this inspection view.
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]);
      const [trip, attempts, history] = await Promise.all([
        supabase.from('ride_requests').select('id,status,ride_category,pickup_location,destination_location,estimated_trip_fare_etb,final_fare_etb,payment_method,payment_status,created_at,accepted_at,pickup_arrived_at,started_at,completed_at,cancelled_at,cancellation_reason,dispatch_state')
          .eq('id', rideId).abortSignal(signal).maybeSingle(),
        supabase.from('ride_request_offers').select('id,driver_id,status,created_at,expires_at,accepted_at')
          .eq('request_id', rideId).order('created_at', { ascending: false }).limit(100).abortSignal(signal),
        supabase.from('ride_journey_events').select('id,event_type,actor_id,recorded_at')
          .eq('ride_request_id', rideId).order('recorded_at', { ascending: true }).order('id', { ascending: true }).limit(200).abortSignal(signal),
      ]);
      if (!active) return;
      setRide(trip.error ? null : trip.data);
      setOffers(attempts.error ? [] : attempts.data || []);
      setEvents(history.error ? [] : history.data || []);
      setErrors([...(trip.error || !trip.data ? ['Trip details unavailable.'] : []),
        ...(attempts.error ? ['Driver offers could not be loaded.'] : []),
        ...(history.error ? ['Event history is temporarily unavailable. Recorded stage times are shown below.'] : [])]);
    })().catch(() => { if (active) setErrors(['Journey details could not be refreshed. Try again.']); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; controller.abort(); };
  }, [rideId, refresh]);
  return <Dialog title="Journey details" onClose={onClose}>
    <div className="biloo-admin-journey">
      <div className="biloo-admin-journey-head"><span>{rideId}</span><Button variant="secondary" disabled={busy} onClick={() => setRefresh(n => n + 1)}><Icon name="refresh" size={15}/>Refresh</Button></div>
      {busy && <p role="status">Loading recorded journey…</p>}
      {errors.map(error => <p role="alert" key={error}>{error}</p>)}
      {ride && <><div className="biloo-admin-journey-status"><strong>{String(ride.status).replaceAll('_', ' ')}</strong><span>{String(ride.ride_category)}</span></div>
        <div className="biloo-journey-stops"><div><span className="biloo-stop-dot"/><div><small>Pickup</small><strong>{String(ride.pickup_location)}</strong></div></div><div><span className="biloo-stop-dot destination"/><div><small>Destination</small><strong>{String(ride.destination_location)}</strong></div></div></div>
        <dl className="biloo-receipt-meta"><div><dt>Estimated fare</dt><dd>{money(ride.estimated_trip_fare_etb)}</dd></div><div><dt>Final fare</dt><dd>{money(ride.final_fare_etb)}</dd></div><div><dt>Payment status</dt><dd>{String(ride.payment_status || 'unknown')}</dd></div><div><dt>Payment method</dt><dd>{String(ride.payment_method || '—')}</dd></div></dl>
        <h3>Recorded stages</h3><ol className="biloo-audit-timeline">{([
          ['Requested', 'created_at'], ['Driver assigned', 'accepted_at'], ['Driver arrived', 'pickup_arrived_at'],
          ['Pickup confirmed / trip started', 'started_at'], ['Completed', 'completed_at'], ['Cancelled', 'cancelled_at'],
        ] as const).filter(([, key]) => ride[key]).map(([label, key]) => <li key={key}><span>{label}</span><time>{time(ride[key])}</time></li>)}</ol>
        {ride.cancellation_reason ? <p>Cancellation: {String(ride.cancellation_reason).replaceAll('_', ' ')}</p> : null}
      </>}
      <h3>Driver offers <small>{offers.length === 100 ? 'Latest 100' : offers.length}</small></h3>
      {!busy && !offers.length && <p>No recorded offers available.</p>}
      <div className="biloo-admin-offers">{offers.map(offer => <div key={offer.id}><strong>{offer.status}</strong><time>{time(offer.created_at)}</time><small>Driver {offer.driver_id}</small>{offer.expires_at && <small>Offer expiry {time(offer.expires_at)}</small>}</div>)}</div>
      <h3>Journey audit</h3><p className="biloo-admin-audit-note">Events are recorded from database changes after this update. Earlier journeys retain their recorded stage times.</p>
      <ol className="biloo-audit-timeline">{events.map(event => <li key={event.id}><span>{event.event_type.replaceAll('_', ' ')}</span><time>{time(event.recorded_at)}</time></li>)}</ol>
      <p className="biloo-admin-audit-note">Payment and settlement actions remain in Financial Oversight. This view does not initiate transactions.</p>
    </div>
  </Dialog>;
}
