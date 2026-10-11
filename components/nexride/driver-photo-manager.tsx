'use client';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { compressPortraitCanvas, photoSizeLabel } from '../../lib/nexride-photo-processing';
import { cleanupRetiredPortraits, DRIVER_PHOTO_BUCKET, portraitCrop, useDriverPortrait, validateDriverPhoto } from '../../lib/nexride-driver-portrait';
import { Dialog, useTranslation } from './ui';
import './driver-photo-manager.css';
export function DriverPhotoManager({ driverId, fullName, children }: { driverId: string; fullName: string; children: ReactNode }) {
  const t = useTranslation(), portrait = useDriverPortrait(driverId);
  const fileRef = useRef<HTMLInputElement>(null), canvasRef = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(false), [view, setView] = useState(false), [confirm, setConfirm] = useState(false);
  const [cropReady, setCropReady] = useState(false);
  const [busy, setBusy] = useState(false), [step, setStep] = useState(0);
  const [source, setSource] = useState(''), [zoom, setZoom] = useState(1), [position, setPosition] = useState({ x: 0, y: 0 });
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [failedURL, setFailedURL] = useState('');
  const initials = fullName.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase() || 'N';
  useEffect(() => () => { if (source) URL.revokeObjectURL(source); }, [source]);
  useEffect(() => {
    let active = true;
    if (!source) return;
    setCropReady(false);
    const image = new window.Image(); image.src = source;
    void image.decode().then(() => {
      if (!active) return;
      const canvas = canvasRef.current, ctx = canvas?.getContext('2d'); if (!canvas || !ctx) return;
      const crop = portraitCrop(image.width, image.height, zoom, position.x, position.y);
      ctx.clearRect(0, 0, 512, 512);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 512, 512);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, crop.x, crop.y, crop.side, crop.side, 0, 0, 512, 512);
      setCropReady(true);
    }).catch(() => { if (active) setError(t('photoInvalidType')); });
    return () => { active = false; };
  }, [source, zoom, position]);
  const choose = (file?: File) => {
    if (!file) return; setError(''); setNotice('');
    const invalid = validateDriverPhoto(file); if (invalid) { setError(t(invalid)); return; }
    setSource(URL.createObjectURL(file)); setZoom(1); setPosition({ x: 0, y: 0 }); setView(false); setConfirm(false);
  };
  const save = async (remove = false) => {
    if (busy || (!remove && (!source || !cropReady))) return;
    if (!navigator.onLine) { setError(t('photoOffline')); return; }
    setBusy(true); setStep(0); setError(''); let uploadedPath = ''; let compressedBytes = 0;
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || data.user?.id !== driverId) throw Error('Authentication required');
      if (!remove) {
        const canvas = canvasRef.current;
        if (!canvas) throw Error('Image preview unavailable');
        const blob = await compressPortraitCanvas(canvas);
        compressedBytes = blob.size;
        setStep(1); uploadedPath = `${driverId}/${crypto.randomUUID()}.jpg`;
        const { error: uploadError } = await supabase.storage.from(DRIVER_PHOTO_BUCKET).upload(uploadedPath, blob, { contentType: 'image/jpeg', upsert: false });
        if (uploadError) throw uploadError;
      }
      setStep(2);
      const { data: retired, error: saveError } = await supabase.rpc('set_driver_profile_photo', { p_storage_path: remove ? null : uploadedPath });
      if (saveError) throw saveError;
      setStep(3); await portrait.refresh();
      const cleaned = await cleanupRetiredPortraits((retired || []) as string[]);
      setNotice(!cleaned ? t('photoCleanup') : remove ? t('photoRemoved') : `${t('photoSaved')} · ${photoSizeLabel(compressedBytes)}`);
      setOpen(false); setSource(''); setConfirm(false);
    } catch {
      if (uploadedPath) await cleanupRetiredPortraits([uploadedPath]); // RLS refuses deleting an active portrait if a response was lost.
      void portrait.refresh(); setError(t(navigator.onLine ? 'photoFailed' : 'photoOffline'));
    } finally { setBusy(false); }
  };
  const close = () => { if (!busy) { setOpen(false); setSource(''); setConfirm(false); setView(false); } };
  const url = portrait.url && failedURL !== portrait.url ? portrait.url : '';
  return <div className="nr-driver-photo-editor">
    <button type="button" className="nr-photo-trigger" onClick={() => { setOpen(true); setError(''); }} aria-label={t('photoTitle')}>
      {children}<span className="nr-photo-approved-overlay">{url ? <img src={url} alt={`${fullName} ${t('photoTitle')}`} onError={() => { setFailedURL(url); void portrait.refresh(); }}/> : <span>{initials}</span>}</span>
      <span className="nr-photo-edit-mark" aria-hidden="true">✎</span>
    </button>
    {portrait.stale && <small role="status">{t('photoOffline')}</small>}
    {notice && <small role="status">{notice}</small>}
    {open && <Dialog title={t(source ? 'photoAdjust' : 'photoTitle')} onClose={close}>
      <div className="nr-photo-panel" aria-busy={busy}>
        {confirm ? <><p>{t('photoConfirm')}</p><button className="nr-photo-danger" disabled={busy} onClick={() => void save(true)}>{t('photoRemove')}</button><button disabled={busy} onClick={() => setConfirm(false)}>{t('photoCancel')}</button></>
          : source ? <><div className="nr-photo-preview"><canvas ref={canvasRef} width={512} height={512} role="img" aria-label={t('photoAdjust')}/></div>
            <label>{t('photoZoom')}<input disabled={busy} type="range" min="1" max="2.5" step=".05" value={zoom} onChange={e => setZoom(Number(e.target.value))}/></label>
            <label>{t('photoHorizontal')}<input disabled={busy} type="range" min="-100" max="100" value={position.x} onChange={e => setPosition(p => ({ ...p, x: Number(e.target.value) }))}/></label>
            <label>{t('photoVertical')}<input disabled={busy} type="range" min="-100" max="100" value={position.y} onChange={e => setPosition(p => ({ ...p, y: Number(e.target.value) }))}/></label>
            <button className="nr-photo-primary" disabled={busy || !cropReady} onClick={() => void save()}>{t(busy ? 'photoSaving' : 'photoSave')}</button><button disabled={busy} onClick={() => fileRef.current?.click()}>{t('photoChange')}</button></>
          : view ? <div className="nr-photo-preview">{url ? <img src={url} alt={`${fullName} ${t('photoTitle')}`}/> : <span>{initials}</span>}</div>
          : <div className="nr-photo-actions"><button disabled={!url} onClick={() => setView(true)}>{t('photoView')}</button><button onClick={() => fileRef.current?.click()}>{t('photoChange')}</button><button className="nr-photo-danger" disabled={!portrait.exists} onClick={() => setConfirm(true)}>{t('photoRemove')}</button><button onClick={close}>{t('photoCancel')}</button></div>}
        {busy && <div role="status"><progress max={3} value={step} aria-label={t('photoSaving')}/><p>{t('photoSaving')}</p></div>}
        {error && <p role="alert" className="nr-photo-error">{error}</p>}
        <input hidden ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { choose(e.target.files?.[0]); e.target.value = ''; }}/>
      </div>
    </Dialog>}
  </div>;
}
