'use client';
import Image from 'next/image';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { translate, type Language } from '../../lib/nexride-i18n';
import { uploadRiderAvatar, type RiderAccount } from '../../lib/nexride-account';
import { riderAvatarValidation } from '../../lib/nexride-rider-avatar';
import { compressPortraitCanvas, compressPortraitThumbnail, photoSizeLabel, portraitCrop, PHOTO_CROP_SIZE, PHOTO_OUTPUT_TARGET_BYTES } from '../../lib/nexride-photo-processing';
import { Dialog, Icon, useTranslation } from './ui';
import './driver-photo-manager.css';
import './rider-avatar-upload.css';

export function RiderPhotoEditor({
  account, initials, language, photoFailed, onImageError, onSaved,
}: {
  account: RiderAccount | null;
  initials: string;
  language: Language;
  photoFailed: boolean;
  onImageError: () => void;
  onSaved: (result: { avatar: string | null; avatarPath: string }, bytes: number) => void;
}) {
  const t = useTranslation();
  const say = (en: string, am: string) => language === 'am' ? am : en;
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState('');
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);
  const [decoded, setDecoded] = useState<{ src: string; image: HTMLImageElement } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => { if (source) URL.revokeObjectURL(source); }, [source]);
  // Decode the original only when a photo is selected, not on each crop gesture.
  useEffect(() => {
    let active = true;
    setDecoded(null);
    setReady(false);
    if (!source || !open) return;
    const image = new window.Image();
    image.decoding = 'async';
    image.src = source;
    void image.decode().then(() => {
      if (!active) return;
      if (!image.naturalWidth || !image.naturalHeight) throw Error('photo_invalid_dimensions');
      setDecoded({ src: source, image });
    }).catch(() => { if (active) setError(translate(language, 'photoInvalidType')); });
    return () => { active = false; };
  }, [source, open, language]);

  // Repaint at high quality using the already-decoded image as zoom/pan changes.
  useEffect(() => {
    if (!open || !source || decoded?.src !== source) { setReady(false); return; }
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const image = decoded.image;
    const crop = portraitCrop(image.naturalWidth, image.naturalHeight, zoom, position.x, position.y);
    ctx.clearRect(0, 0, PHOTO_CROP_SIZE, PHOTO_CROP_SIZE);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PHOTO_CROP_SIZE, PHOTO_CROP_SIZE);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, crop.x, crop.y, crop.side, crop.side, 0, 0, PHOTO_CROP_SIZE, PHOTO_CROP_SIZE);
    setReady(true);
  }, [decoded, source, open, zoom, position]);

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || busy) return;
    const invalid = riderAvatarValidation(file);
    if (invalid) {
      setError(invalid === 'type' ? t('photoInvalidType') : t('photoInvalidSize'));
      return;
    }
    setError('');
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setReady(false);
    setSource(URL.createObjectURL(file));
    setOpen(true);
  };

  const save = async () => {
    if (!account || !source || !ready || busy) return;
    if (!navigator.onLine) { setError(t('photoOffline')); return; }
    setBusy(true);
    setError('');
    try {
      const canvas = canvasRef.current;
      if (!canvas) throw Error('photo_compression_failed');
      const optimized = await compressPortraitCanvas(canvas);
      const upload = new File([optimized], 'nexride-profile.jpg', { type: 'image/jpeg' });
      const thumbnail = await compressPortraitThumbnail(canvas).catch(() => null);
      const result = await uploadRiderAvatar(account, upload, thumbnail);
      onSaved(result, optimized.size);
      setSource('');
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error && cause.message === 'avatar_auth_required'
        ? say('Sign in again to change your photo.', 'ፎቶዎን ለመቀየር እንደገና ይግቡ።')
        : t(navigator.onLine ? 'photoFailed' : 'photoOffline'));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (busy) return;
    setOpen(false);
    setSource('');
    setError('');
    setReady(false);
  };

  return (
    <div className="nr-account-avatar-wrap nr-rider-photo-editor" data-edit-action="true">
      <button
        type="button"
        className="nr-account-avatar"
        disabled={!account || busy}
        onClick={() => { setError(''); setOpen(true); }}
        aria-label={say('Change profile photo', 'የመገለጫ ፎቶ ቀይር')}
      >
        <Icon name="user" size={27}/>
      </button>
      {account && <span className="nr-rider-avatar-change" aria-hidden="true"><Icon name="plus" size={16}/></span>}
      {open && account && (
        <Dialog title={t(source ? 'photoAdjust' : 'photoTitle')} onClose={close}>
          <div className="nr-photo-panel nr-rider-photo-panel" aria-busy={busy}>
            {source ? (
              <>
                <div className="nr-photo-preview">
                  <canvas ref={canvasRef} width={PHOTO_CROP_SIZE} height={PHOTO_CROP_SIZE} role="img" aria-label={t('photoAdjust')}/>
                </div>
                <label>{t('photoZoom')}
                  <input disabled={busy} type="range" min="1" max="2.5" step=".05" value={zoom}
                    onChange={e => setZoom(Number(e.target.value))}/>
                </label>
                <label>{t('photoHorizontal')}
                  <input disabled={busy} type="range" min="-100" max="100" value={position.x}
                    onChange={e => setPosition(p => ({ ...p, x: Number(e.target.value) }))}/>
                </label>
                <label>{t('photoVertical')}
                  <input disabled={busy} type="range" min="-100" max="100" value={position.y}
                    onChange={e => setPosition(p => ({ ...p, y: Number(e.target.value) }))}/>
                </label>
                <button type="button" disabled={busy} onClick={() => { setZoom(1); setPosition({ x: 0, y: 0 }); }}>
                  {say('Reset crop', 'የፎቶ ቅንብርን ዳግም አስጀምር')}
                </button>
                <p className="nr-photo-optimization-info">
                  {say('Optimized to a sharp, square image under ', 'የፎቶ ጥራትን በመጠበቅ ወደ ካሬ የሚቀየር፣ ከ ')}
                  {photoSizeLabel(PHOTO_OUTPUT_TARGET_BYTES)}
                  {say(' before upload.', ' በታች የሚሆን ፎቶ ነው።')}
                </p>
                <button className="nr-photo-primary" type="button" disabled={busy || !ready} onClick={() => void save()}>
                  {t(busy ? 'photoSaving' : 'photoSave')}
                </button>
                <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>{t('photoChange')}</button>
              </>
            ) : (
              <>
                <div className="nr-photo-preview">
                  {account.avatar && !photoFailed
                    ? <Image src={account.avatar} alt={t('photoTitle')} width={190} height={190} unoptimized onError={onImageError}/>
                    : <span>{initials}</span>}
                </div>
                <p>{say('Choose a photo to crop, zoom and position before saving.', 'ከማስቀመጥዎ በፊት ለመቁረጥ፣ ለማጉላት እና ቦታ ለማስተካከል ፎቶ ይምረጡ።')}</p>
                <button className="nr-photo-primary" type="button" onClick={() => inputRef.current?.click()}>{t('photoChange')}</button>
              </>
            )}
            {busy && <p role="status">{t('photoSaving')}</p>}
            {error && <p role="alert" className="nr-photo-error">{error}</p>}
            <input ref={inputRef} className="nr-rider-avatar-input" tabIndex={-1} type="file"
              accept="image/jpeg,image/png,image/webp" aria-label={say('Choose profile photo','የመገለጫ ፎቶ ይምረጡ')}
              onChange={choose} disabled={busy}/>
            <button type="button" disabled={busy} onClick={close}>{t('photoCancel')}</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
