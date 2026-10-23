'use client';
import { useEffect, useState } from 'react';
import { readAccount, invalidateRiderAccountCache } from './nexride-account';
import { supabase } from './supabase';

type Portrait = { id: string; name: string; url: string };
const empty: Portrait = { id: '', name: '', url: '' };
let warm: Portrait = empty;
let lastUrl = '';
function warmImage(url: string) {
  if (!url || url === lastUrl || typeof window === 'undefined') return;
  lastUrl = url;
  const img = new window.Image();
  img.decoding = 'async';
  img.src = url;
  void img.decode().catch(() => { if (lastUrl === url) lastUrl = ''; });
}

/** The signed account portrait is shared by Rider and Driver hamburger drawers.
 * One Supabase profile, user-scoped memory cache, no persistent private image
 * storage, no URL regeneration on every drawer open. Driver verification photos
 * remain in the separate approved-photo bucket and are not altered here.
 */
export function useSharedAccountPortrait() {
  const [portrait, setPortrait] = useState<Portrait>(empty);
  useEffect(() => {
    let live = true;
    let request = 0;
    async function refresh(clear = false) {
      const revision = ++request;
      if (clear) invalidateRiderAccountCache();
      try {
        const { data } = await supabase.auth.getSession();
        if (!live || revision !== request) return;
        const id = data.session?.user.id ?? '';
        if (!id) {
          warm = empty;
          setPortrait(empty);
          return;
        }
        if (warm.id !== id) setPortrait(empty);
        else setPortrait(warm);
        const account = await readAccount();
        if (!live || revision !== request || account?.id !== id) return;
        const next: Portrait = { id, name: account.profile.name, url: account.avatar ?? '' };
        warm = next;
        setPortrait(next);
        warmImage(next.url);
      } catch {
        // Offline and temporary failures keep the last successfully decoded
        // portrait only for the same account; never show a previous user's image.
      }
    }
    void refresh();
    const changed = () => { void refresh(true); };
    const focused = () => { void refresh(); };
    const { data: auth } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') {
        ++request;
        warm = empty;
        lastUrl = '';
        invalidateRiderAccountCache();
        if (live) setPortrait(empty);
      } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        window.setTimeout(() => { if (live) void refresh(true); }, 0);
      }
    });
    window.addEventListener('nexride:profile-change', changed);
    window.addEventListener('focus', focused);
    const online = () => { lastUrl = ''; void refresh(); };
    window.addEventListener('online', online);
    return () => {
      live = false; ++request;
      auth.subscription.unsubscribe();
      window.removeEventListener('nexride:profile-change', changed);
      window.removeEventListener('focus', focused);
      window.removeEventListener('online', online);
    };
  }, []);
  return portrait;
}
