'use client';

import { useEffect, useState } from 'react';
import { nexrideApiFetch } from './nexride-api-auth';
import { supabase } from './supabase';
import { driverMapAvatarSource, normalizeDriverMapAvatar, type DriverMapAvatar, type DriverAvatarProfile, type DriverAvatarStyle } from './biloo-driver-map-avatar';

export const DRIVER_AVATAR_UPDATED = 'biloo:driver-map-avatar-updated';
export async function loadDriverMapAvatar(signal?: AbortSignal): Promise<DriverAvatarProfile> {
  const response = await nexrideApiFetch('/api/driver/map-avatar', { cache: 'no-store', signal });
  if (!response.ok) throw new Error('Vehicle avatar unavailable');
  return response.json();
}
export async function saveDriverMapAvatar(style: DriverAvatarStyle): Promise<DriverAvatarProfile> {
  const response = await nexrideApiFetch('/api/driver/map-avatar', { method: 'PATCH', body: JSON.stringify({ style }) });
  if (!response.ok) throw new Error('Could not save your map avatar. Please try again.');
  const profile: DriverAvatarProfile = await response.json();
  // No unscoped local cache: another Driver using this device must not inherit the car.
  window.dispatchEvent(new Event(DRIVER_AVATAR_UPDATED));
  return profile;
}
export function useDriverMapAvatar(enabled: boolean): DriverMapAvatar | null {
  const [avatar, setAvatar] = useState<DriverMapAvatar | null>(null);
  useEffect(() => {
    if (!enabled) { setAvatar(null); return; }
    let active = true;
    let sequence = 0;
    const controller = new AbortController();
    const refresh = () => {
      const revision = ++sequence;
      void loadDriverMapAvatar(controller.signal).then(profile => {
        if (!active || revision !== sequence) return;
        const next = normalizeDriverMapAvatar(profile.avatar);
        setAvatar(current => current?.bodyType === next.bodyType && current.color === next.color && current.style === next.style ? current : next);
      }).catch(() => {});
    };
    refresh();
    let accountId: string | undefined;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (accountId === session?.user.id) return;
      accountId = session?.user.id;
      ++sequence; setAvatar(null);
      if (accountId) queueMicrotask(refresh);
    });
    window.addEventListener(DRIVER_AVATAR_UPDATED, refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    const timer = window.setInterval(() => { if (!document.hidden && navigator.onLine) refresh(); }, 30_000);
    return () => { active = false; controller.abort(); subscription.unsubscribe(); window.clearInterval(timer); window.removeEventListener(DRIVER_AVATAR_UPDATED, refresh); window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh); };
  }, [enabled]);
  return avatar;
}

/** Share the same DOM art on Mapbox and Leaflet, without transforming the GPS anchor. */
export function updateDriverCarMarker(element: HTMLElement, value: unknown, heading?: number | null, bearing = 0) {
  const avatar = normalizeDriverMapAvatar(value);
  element.classList.add('biloo-driver-car-marker');
  element.dataset.bodyType = avatar.bodyType;
  element.dataset.vehicleColor = avatar.color || 'unknown';
  element.dataset.avatarStyle = avatar.style;
  let art = element.querySelector<HTMLImageElement>('.biloo-driver-car-art');
  if (!art) {
    element.replaceChildren();
    art = document.createElement('img');
    art.className = 'biloo-driver-car-art'; art.alt = ''; art.width = 32; art.height = 55; art.draggable = false;
    element.append(art);
  }
  const source = driverMapAvatarSource(avatar);
  if (art.getAttribute('src') !== source) art.src = source;
  art.style.setProperty('--biloo-car-heading', `${typeof heading === 'number' && Number.isFinite(heading) && heading >= 0 && heading <= 360 ? heading - bearing : 0}deg`);
}

export function driverCarMarkerElement(label: string, value: unknown, heading?: number | null, bearing = 0): HTMLDivElement {
  const element = document.createElement('div');
  element.setAttribute('role', 'img'); element.setAttribute('aria-label', label);
  updateDriverCarMarker(element, value, heading, bearing);
  return element;
}
