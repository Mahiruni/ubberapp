'use client';

import { useContext, useEffect, useRef, useState } from 'react';
import { Icon, LanguageContext, Spinner } from './ui';
import { nexrideApiFetch } from '../../lib/nexride-api-auth';
import { PICKUP_SIGNAL_COOLDOWN_MS } from '../../lib/biloo-rider-motion';
import { pickupSignal } from './use-pickup-signal';

export function PickupWaveButton({ tripId }: { tripId: string }) {
  const language = useContext(LanguageContext);
  const say = (en: string, am: string) => language === 'am' ? am : en;
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const pending = useRef(false), nonce = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    setState('idle'); nonce.current = ''; pending.current = false;
    return () => { clearTimeout(timer.current); controller.current?.abort(); };
  }, [tripId]);
  const send = async () => {
    if (pending.current || state === 'sent') return;
    pending.current = true; setState('sending');
    if (!nonce.current) nonce.current = crypto.randomUUID();
    const request = new AbortController(); controller.current = request;
    try {
      const response = await nexrideApiFetch(`/api/trips/${encodeURIComponent(tripId)}/pickup-signal`, { method: 'POST', body: JSON.stringify({ nonce: nonce.current }), signal: request.signal });
      const result = await response.json();
      const signal = pickupSignal(result.signal);
      if (!response.ok || !signal) throw new Error('send_failed');
      if (request.signal.aborted) return;
      setState('sent'); nonce.current = '';
      window.dispatchEvent(new CustomEvent('biloo:pickup-signal-sent', { detail: { tripId, signal } }));
      timer.current = setTimeout(() => setState('idle'), PICKUP_SIGNAL_COOLDOWN_MS);
    } catch { if (!request.signal.aborted) setState('error'); }
    finally { pending.current = false; }
  };
  return <div className="biloo-pickup-wave">
    <button type="button" onClick={() => void send()} disabled={state === 'sending' || state === 'sent'} aria-busy={state === 'sending'}>
      {state === 'sending' ? <Spinner/> : <Icon name={state === 'sent' ? 'check' : 'wave'} size={18}/>}{state === 'sending' ? say('Sending…', 'በመላክ ላይ…') : state === 'sent' ? say('Sent to your driver', 'ለአሽከርካሪዎ ተልኳል') : say("I'm here", 'እዚህ ነኝ')}
    </button>
    <p role={state === 'error' ? 'alert' : 'status'}>{state === 'error' ? say('Couldn’t send. Check your connection and try again.', 'መላክ አልተቻለም። ግንኙነትዎን ያረጋግጡና እንደገና ይሞክሩ።') : state === 'sent' ? say('Your pickup signal is in the trip chat.', 'የመነሻ ምልክትዎ በጉዞ ውይይቱ ውስጥ ተልኳል።') : say('At pickup? Let your driver know.', 'መነሻ ላይ ነዎት? ለአሽከርካሪዎ ያሳውቁ።')}</p>
  </div>;
}
