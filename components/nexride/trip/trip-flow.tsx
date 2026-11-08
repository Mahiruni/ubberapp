'use client';

import { useEffect, useRef, useState } from 'react';
import type { LngLat } from './engine';
import { MapLayer, type MapLike } from './map-layer';
import { useTripSim } from './use-trip';
import s from './trip.module.css';

export interface Place { lngLat: LngLat; label: string }

interface Props {
  map: MapLike;
  pickup: Place;
  destination: Place;
  route?: LngLat[];
  initialFare?: number;
  getRoute?: (from: LngLat, to: LngLat) => Promise<LngLat[]>;
  onExit?: () => void;
}

/** Swap these for your translation keys (English/Amharic). */
const COPY = {
  preview: 'Preview: sample drivers, no real request is sent',
  yourFare: 'Your fare',
  find: 'Find a driver',
  searching: 'Looking for drivers',
  searchingSub: 'Drivers nearby will send you offers.',
  offers: 'Choose your driver',
  confirming: 'Confirming your driver',
  accept: 'Accept',
  decline: 'Decline',
  cancel: 'Cancel ride',
  enroute: 'Your driver is on the way',
  arrived: 'Your driver has arrived',
  arrivedSub: 'Look for this plate.',
  riding: 'On your way',
  done: 'You have arrived',
  rate: 'Rate your driver',
  finish: 'Done',
  cancelled: 'Ride cancelled',
  again: 'Request again',
};

const fmtDist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`);
const initials = (n: string) => n.split(' ').map((p) => p[0]).join('');

export function TripFlow({ map, pickup, destination, route, initialFare, getRoute, onExit }: Props) {
  const sim = useTripSim({ pickup: pickup.lngLat, destination: destination.lngLat, route, initialFare, getRoute });
  const { phase, offers, driver, fare, ui } = sim;
  const sheet = useRef<HTMLDivElement>(null);
  const [inset, setInset] = useState(300);
  const [stars, setStars] = useState(5);

  useEffect(() => {
    const el = sheet.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setInset(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const progress = ui.total ? Math.min(1, 1 - ui.remaining / ui.total) : 0;
  const route2 = (
    <div className={s.route}>
      <div className={s.row}><span className={s.dotA} />{pickup.label}</div>
      <div className={s.row}><span className={s.dotB} />{destination.label}</div>
    </div>
  );

  return (
    <>
      <MapLayer map={map} sim={sim} pickup={pickup.lngLat} destination={destination.lngLat} bottomInset={inset} />
      <div className={s.sheet} ref={sheet} role="region" aria-live="polite">
        <div className={s.grab} />
        <p className={s.preview}>{COPY.preview}</p>
        <div key={phase} className={s.fade}>
          {phase === 'idle' && (
            <>
              {route2}
              <div className={s.fare}>
                <button className={s.step} aria-label="Lower fare" onClick={() => sim.setFare(fare - 10)}>−</button>
                <div className={s.amount} aria-label={COPY.yourFare}>ETB {fare}</div>
                <button className={s.step} aria-label="Raise fare" onClick={() => sim.setFare(fare + 10)}>+</button>
              </div>
              <button className={s.btn} onClick={sim.request}>{COPY.find}</button>
            </>
          )}

          {phase === 'searching' && (
            <>
              <h2 className={s.title}>{COPY.searching}</h2>
              <p className={s.sub}>{COPY.searchingSub}</p>
              <button className={`${s.btn} ${s.ghost}`} onClick={sim.cancel}>{COPY.cancel}</button>
            </>
          )}

          {phase === 'offers' && (
            <>
              <h2 className={s.title}>{offers.length ? COPY.offers : COPY.confirming}</h2>
              {offers.map((o) => (
                <div className={s.offer} key={o.id}>
                  <div className={s.offerTop}>
                    <div className={s.avatar}>{initials(o.name)}</div>
                    <div className={s.grow}>
                      <div className={s.name}>{o.name} ★ {o.rating}</div>
                      <div className={s.meta}>{o.car}</div>
                      <div className={s.meta}>{o.etaMin} min away</div>
                    </div>
                    <div className={s.price}>ETB {o.price}</div>
                  </div>
                  <div className={s.pair}>
                    <button className={`${s.btn} ${s.ghost}`} onClick={() => sim.decline(o.id)}>{COPY.decline}</button>
                    <button className={s.btn} onClick={() => sim.accept(o.id)}>{COPY.accept}</button>
                  </div>
                  <span className={s.timer} style={{ animationDuration: `${o.ttl}s` }} />
                </div>
              ))}
            </>
          )}

          {(phase === 'enroute' || phase === 'arrived' || phase === 'riding') && driver && (
            <>
              <h2 className={s.title}>
                {phase === 'enroute' && `${COPY.enroute}, ${ui.etaMin} min`}
                {phase === 'arrived' && COPY.arrived}
                {phase === 'riding' && `${COPY.riding}, ${ui.etaMin} min left`}
              </h2>
              <p className={s.sub}>
                {phase === 'arrived' ? COPY.arrivedSub : `${fmtDist(ui.remaining)} ${phase === 'riding' ? 'to destination' : 'away'}`}
              </p>
              <div className={s.bar}><div className={s.barFill} style={{ width: `${(phase === 'arrived' ? 1 : progress) * 100}%` }} /></div>
              <div className={s.offerTop}>
                <div className={s.avatar}>{initials(driver.name)}</div>
                <div className={s.grow}>
                  <div className={s.name}>{driver.name} ★ {driver.rating}</div>
                  <div className={s.meta}>{driver.car}</div>
                </div>
                <span className={s.plate}>{driver.plate}</span>
              </div>
              {phase !== 'riding' && <button className={`${s.btn} ${s.ghost}`} onClick={sim.cancel}>{COPY.cancel}</button>}
            </>
          )}

          {phase === 'done' && driver && (
            <>
              <h2 className={s.title}>{COPY.done}</h2>
              <p className={s.sub}>Fare ETB {driver.price}. {COPY.rate}</p>
              <div className={s.stars}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} className={`${s.star} ${n <= stars ? s.starOn : ''}`} aria-label={`${n} stars`} onClick={() => setStars(n)}>★</button>
                ))}
              </div>
              <button className={s.btn} onClick={() => { sim.reset(); onExit?.(); }}>{COPY.finish}</button>
            </>
          )}

          {phase === 'cancelled' && (
            <>
              <h2 className={s.title}>{COPY.cancelled}</h2>
              <button className={s.btn} onClick={sim.reset}>{COPY.again}</button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
