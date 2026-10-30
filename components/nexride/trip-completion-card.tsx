'use client';
import { useContext, useEffect, useRef, useState } from 'react';
import { Button, Icon, LanguageContext } from './ui';
import './trip-completion-premium.css';
import type { TripSnapshot } from '../../lib/nexride-trip-data';
import { submitRiderRating } from '../../lib/nexride-trip-service';
import { receiptPaymentState } from '../../lib/biloo-receipt-payment';

export function TripCompletionCard({ snapshot, role = 'rider', onDone, onHistory }: {
  snapshot: TripSnapshot | null; role?: 'rider' | 'driver'; onDone: () => void; onHistory: () => void;
}) {
  const language = useContext(LanguageContext);
  const say = (en: string, am: string) => language === 'am' ? am : en;
  const [score, setScore] = useState(0), [feedback, setFeedback] = useState('');
  const [saved, setSaved] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false);
  useEffect(() => { setSaved(snapshot?.rating?.score || 0); setScore(snapshot?.rating?.score || 0); }, [snapshot?.id, snapshot?.rating?.score]);
  const submit = async () => {
    if (!snapshot || snapshot.status !== 'completed' || !score || saved || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await submitRiderRating({ tripId: snapshot.id, score, feedback, tags: [] });
      setSaved(result.rating.score);
    } catch { setError(say('Your rating could not be saved. Please try again.', 'ደረጃዎ አልተቀመጠም። እንደገና ይሞክሩ።')); }
    finally { lock.current = false; setBusy(false); }
  };
  if (!snapshot || snapshot.status !== 'completed') return <div className="biloo-completion-pending" role="status">
    <Icon name="clock" size={24}/><h2>{say('Loading your trip summary', 'የጉዞዎን ማጠቃለያ በመጫን ላይ')}</h2>
    <p>{say('Waiting for the confirmed trip record. Reconnect to refresh.', 'የተረጋገጠውን የጉዞ መረጃ በመጠባበቅ ላይ። እንደገና ይገናኙ።')}</p>
    <Button variant="secondary" onClick={onHistory}>{say('Trip history', 'የጉዞ ታሪክ')}</Button>
  </div>;
  const fare = snapshot.finalAmount;
  const duration = snapshot.startedAt && snapshot.completedAt && snapshot.completedAt >= snapshot.startedAt
    ? Math.max(1, Math.round((snapshot.completedAt - snapshot.startedAt) / 60_000)) : null;
  const payment = receiptPaymentState(snapshot.payment);
  const cash = snapshot.payment.method?.trim().toLowerCase() === 'cash';
  const method = cash ? say('Cash', 'ጥሬ ገንዘብ') : snapshot.payment.method?.toLowerCase() === 'chapa' ? 'Chapa' : snapshot.payment.method || say('Payment', 'ክፍያ');
  return <article className="biloo-completion-card" data-role={role} aria-label={say('Trip receipt and rating', 'የጉዞ ደረሰኝ እና ደረጃ')}>
    <div className="biloo-completion-scroll">
      <header className="biloo-completion-heading">
        <span className="biloo-arrival-mark" aria-hidden="true"><Icon name="check" size={23}/></span>
        <div><span className="biloo-journey-eyebrow">{say('BILOO · TRIP COMPLETE', 'BILOO · ጉዞ ተጠናቋል')}</span>
          <h1>{role === 'rider' ? say("You've arrived!", 'ደርሰዋል!') : say('Trip completed', 'ጉዞው ተጠናቋል')}</h1>
        </div>
      </header>
      <div className="biloo-receipt-fare">
        <div className="biloo-receipt-fare-top"><small>{say('Total fare', 'ጠቅላላ ዋጋ')}</small><Icon name="money" size={21}/></div>
        <strong>{fare ? <>{fare.amount.toLocaleString(language === 'am' ? 'am-ET' : 'en-ET', { maximumFractionDigits: 2 })}<span> {fare.currency}</span></> : '—'}</strong>
        <div className="biloo-receipt-payment-row">
          <span className="biloo-receipt-method"><Icon name={cash ? 'money' : 'card'} size={15}/>{method}</span>
          <span className="biloo-payment-state" data-status={payment}><Icon name={payment === 'paid' ? 'check' : payment === 'cash' ? 'wallet' : 'clock'} size={14}/>
            {payment === 'paid' ? say('Payment completed', 'ክፍያ ተጠናቋል')
              : payment === 'cash' ? say('With your driver', 'ከአሽከርካሪዎ ጋር')
              : payment === 'pending' ? say('Payment pending', 'ክፍያ በመጠባበቅ ላይ')
              : payment === 'failed' ? say('Payment needs attention', 'ክፍያ እርምጃ ይፈልጋል') : say('Status unavailable', 'ሁኔታው አይገኝም')}</span>
        </div>
      </div>
      <div className="biloo-journey-stops">
        <div><span className="biloo-receipt-stop pickup" aria-hidden="true"><span/></span><div><small>{say('Pickup', 'መነሻ')}</small><strong>{snapshot.pickup.name || '—'}</strong></div></div>
        <div><span className="biloo-receipt-stop destination" aria-hidden="true"><Icon name="pin" size={19}/></span><div><small>{say('Destination', 'መድረሻ')}</small><strong>{snapshot.destination.name || '—'}</strong></div></div>
      </div>
      {role === 'rider' && <section className="biloo-rating" aria-label={say('Rate your driver', 'አሽከርካሪዎን ይገምግሙ')}>
        <h2>{saved ? say('Thank you for your feedback', 'ለአስተያየትዎ እናመሰግናለን') : say('How was your ride?', 'ጉዞዎ እንዴት ነበር?')}</h2>
        <div className="biloo-rating-stars" role="group" aria-label={say('Rating out of five stars', 'ከአምስት ኮከቦች ደረጃ')}>
          {[1,2,3,4,5].map(value => <button type="button" key={value} disabled={busy || !!saved}
            aria-label={value + ' ' + say(value === 1 ? 'star' : 'stars', 'ኮከብ')} aria-pressed={(saved || score) >= value}
            onClick={() => setScore(value)}><Icon name="star" size={25}/></button>)}
        </div>
        {!saved && score > 0 && <>
          <details className="biloo-rating-note"><summary>{say('Add a note', 'አስተያየት ያክሉ')} <span>{say('Optional', 'አማራጭ')}</span></summary>
            <label className="biloo-pickup-note"><span>{say('Feedback', 'አስተያየት')}</span>
              <textarea rows={2} maxLength={1000} value={feedback} disabled={busy} onChange={event => setFeedback(event.target.value)}/>
            </label>
          </details>
          {error && <p role="alert">{error}</p>}
          <Button disabled={busy} loading={busy} onClick={() => void submit()}>{say('Submit rating', 'ደረጃ ላክ')}</Button>
        </>}
        {saved > 0 && <p role="status"><Icon name="check" size={15}/>{say('Rating saved', 'ደረጃው ተቀምጧል')}</p>}
      </section>}
      <details className="biloo-receipt-details"><summary><Icon name="list" size={17}/><span>{say('Trip details', 'የጉዞ ዝርዝሮች')}</span><Icon name="chevron" size={16}/></summary>
        <dl className="biloo-receipt-meta">
          {duration !== null && <div><dt>{say('Trip duration', 'የጉዞ ቆይታ')}</dt><dd>{duration} {say('min', 'ደቂቃ')}</dd></div>}
          {snapshot.estimatedDistanceMeters != null && <div><dt>{say('Estimated route distance', 'የተገመተ የመንገድ ርቀት')}</dt><dd>{(snapshot.estimatedDistanceMeters / 1000).toFixed(1)} km</dd></div>}
          <div><dt>{say('Payment method', 'የክፍያ መንገድ')}</dt><dd>{method}</dd></div>
          {snapshot.driver?.name && <div><dt>{say('Driver', 'አሽከርካሪ')}</dt><dd>{snapshot.driver.name}</dd></div>}
        </dl>
        <p className="biloo-trip-reference">{say('Trip reference', 'የጉዞ መለያ')} <span>{snapshot.id}</span></p>
      </details>
    </div>
    <footer className="biloo-completion-actions">
      <Button onClick={onDone}>{role === 'rider' ? say('Done', 'ጨርስ') : say('Driver home', 'የአሽከርካሪ መነሻ')}</Button>
      <Button variant="secondary" onClick={onHistory}>{role === 'rider' ? say('Trip history', 'የጉዞ ታሪክ') : say('Earnings', 'ገቢ')}</Button>
    </footer>
  </article>;
}
