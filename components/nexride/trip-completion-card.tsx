'use client';
import { useContext, useEffect, useRef, useState } from 'react';
import { Button, Icon, LanguageContext } from './ui';
import './trip-completion-premium.css';
import type { TripSnapshot } from '../../lib/nexride-trip-data';
import { submitRiderRating } from '../../lib/nexride-trip-service';

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
  const payment = snapshot.payment.status;
  const cash = snapshot.payment.method?.toLowerCase() === 'cash';
  return <article className="biloo-completion-card" aria-label={say('Trip receipt and rating', 'የጉዞ ደረሰኝ እና ደረጃ')}>
    <header><span className="biloo-arrival-mark"><Icon name="check" size={26}/></span>
      <span className="biloo-journey-eyebrow">BILOO · {say('JOURNEY COMPLETE', 'ጉዞ ተጠናቋል')}</span>
      <h1>{role === 'rider' ? say("You've arrived!", 'ደርሰዋል!') : say('Trip completed', 'ጉዞው ተጠናቋል')}</h1>
      <p>{role === 'rider' ? say('Thank you for riding with Biloo.', 'ከቢሎ ጋር ስለተጓዙ እናመሰግናለን።') : say('Thank you for driving with Biloo.', 'ከቢሎ ጋር ስላሽከረከሩ እናመሰግናለን።')}</p>
    </header>
    <div className="biloo-receipt-fare"><small>{say('Final confirmed fare', 'የመጨረሻ የተረጋገጠ ዋጋ')}</small>
      <strong>{fare ? <>{fare.amount.toLocaleString(language === 'am' ? 'am-ET' : 'en-ET', { maximumFractionDigits: 2 })}<span> ETB</span></> : '—'}</strong>
      <span className="biloo-payment-state" data-status={payment}><Icon name={payment === 'paid' ? 'check' : 'clock'} size={15}/>
        {payment === 'paid' ? (cash ? say('Cash payment recorded · driver collects fare', 'የጥሬ ገንዘብ ክፍያ ተመዝግቧል') : say('Payment completed', 'ክፍያ ተጠናቋል'))
          : payment === 'pending' ? say('Payment pending', 'ክፍያ በመጠባበቅ ላይ')
          : payment === 'failed' ? say('Payment needs attention', 'ክፍያ እርምጃ ይፈልጋል') : say('Payment status unavailable', 'የክፍያ ሁኔታ አይገኝም')}</span>
      {payment !== 'paid' && <p>{cash ? say('Cash payment is awaiting the recorded completion update. Driver earnings are tracked separately.', 'የጥሬ ገንዘብ ክፍያ ማረጋገጫ በመጠባበቅ ላይ ነው።') : say('Trip completion does not confirm digital payment.', 'ጉዞ መጠናቀቁ ዲጂታል ክፍያን አያረጋግጥም።')}</p>}
    </div>
    <div className="biloo-journey-stops">
      <div><span className="biloo-stop-dot"/><div><small>{say('Pickup', 'መነሻ')}</small><strong>{snapshot.pickup.name || '—'}</strong></div></div>
      <div><span className="biloo-stop-dot destination"/><div><small>{say('Destination', 'መድረሻ')}</small><strong>{snapshot.destination.name || '—'}</strong></div></div>
    </div>
    <dl className="biloo-receipt-meta">
      {duration !== null && <div><dt>{say('Trip duration', 'የጉዞ ቆይታ')}</dt><dd>{duration} {say('min', 'ደቂቃ')}</dd></div>}
      {snapshot.estimatedDistanceMeters != null && <div><dt>{say('Estimated route distance', 'የተገመተ የመንገድ ርቀት')}</dt><dd>{(snapshot.estimatedDistanceMeters / 1000).toFixed(1)} km</dd></div>}
      <div><dt>{say('Payment method', 'የክፍያ መንገድ')}</dt><dd>{snapshot.payment.method || '—'}</dd></div>
      {snapshot.driver?.name && <div><dt>{say('Driver', 'አሽከርካሪ')}</dt><dd>{snapshot.driver.name}</dd></div>}
    </dl>
    {role === 'rider' && <section className="biloo-rating" aria-label={say('Rate your driver', 'አሽከርካሪዎን ይገምግሙ')}>
      <h2>{saved ? say('Thank you for your feedback', 'ለአስተያየትዎ እናመሰግናለን') : say('How was your ride?', 'ጉዞዎ እንዴት ነበር?')}</h2>
      <div className="biloo-rating-stars" role="group" aria-label={say('Rating out of five stars', 'ከአምስት ኮከቦች ደረጃ')}>
        {[1,2,3,4,5].map(value => <button type="button" key={value} disabled={busy || !!saved}
          aria-label={`${value} ${say(value === 1 ? 'star' : 'stars', 'ኮከብ')}`} aria-pressed={(saved || score) >= value}
          onClick={() => setScore(value)}><Icon name="star" size={31}/></button>)}
      </div>
      {!saved && <><label className="biloo-pickup-note"><span>{say('Feedback', 'አስተያየት')} <small>{say('Optional', 'አማራጭ')}</small></span>
        <textarea rows={2} maxLength={1000} value={feedback} disabled={busy} onChange={event => setFeedback(event.target.value)}/></label>
        {error && <p role="alert">{error}</p>}
        <Button disabled={!score || busy} loading={busy} onClick={() => void submit()}>{say('Submit rating', 'ደረጃ ላክ')}</Button></>}
      {saved > 0 && <p role="status"><Icon name="check" size={15}/>{say('Rating saved', 'ደረጃው ተቀምጧል')}</p>}
    </section>}
    <p className="biloo-trip-reference">{say('Trip reference', 'የጉዞ መለያ')} <span>{snapshot.id}</span></p>
    <div className="biloo-completion-actions"><Button onClick={onDone}>{role === 'rider' ? say('Plan another ride', 'ሌላ ጉዞ አቅድ') : say('Ready for the next ride', 'ለቀጣይ ጉዞ ዝግጁ')}</Button>
      <Button variant="secondary" onClick={onHistory}>{role === 'rider' ? say('Trip history', 'የጉዞ ታሪክ') : say('View earnings and payment status', 'ገቢና የክፍያ ሁኔታ ይመልከቱ')}</Button></div>
  </article>;
}
