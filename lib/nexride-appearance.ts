'use client';

import { useCallback, useEffect, useState } from 'react';

export type AppearancePreference = 'light' | 'dark' | 'system';
export type Appearance = 'light' | 'dark';
const eventName = 'nexride:appearance-change';
export function appearanceKey(role: 'rider' | 'driver') { return `nexride.${role}.theme`; }
const midnightMigrationKey = (role: 'rider' | 'driver') => `nexride.${role}.midnight-v1`;
export function resolveAppearance(preference: AppearancePreference, systemDark: boolean): Appearance {
  return preference === 'system' ? systemDark ? 'dark' : 'light' : preference;
}
export function useAppearance(role: 'rider' | 'driver') {
  // Midnight Edition is the default for new Rider and Driver installs; saved user preferences still win.
  const fallback: AppearancePreference = 'dark';
  const [preference, setState] = useState<AppearancePreference>(fallback);
  const [systemDark, setSystemDark] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const read = () => {
      try {
        const migrated = localStorage.getItem(midnightMigrationKey(role)) === '1';
        if (!migrated) {
          // Older Rider installs persisted the former light default. Show
          // Midnight Edition once to existing users; allow them to switch
          // back to Light or System from Settings at any time.
          localStorage.setItem(appearanceKey(role), 'dark');
          localStorage.setItem(midnightMigrationKey(role), '1');
          setState('dark');
        } else {
          const saved = localStorage.getItem(appearanceKey(role));
          setState(saved === 'light' || saved === 'dark' || saved === 'system' ? saved : fallback);
        }
      } catch { /* Device storage is optional until a preference is changed. */ }
      setSystemDark(media.matches);
    };
    read();
    media.addEventListener('change', read);
    window.addEventListener(eventName, read);
    window.addEventListener('storage', read);
    return () => { media.removeEventListener('change', read); window.removeEventListener(eventName, read); window.removeEventListener('storage', read); };
  }, [role, fallback]);
  const setPreference = useCallback((next: AppearancePreference) => {
    try {
      localStorage.setItem(appearanceKey(role), next);
      localStorage.setItem(midnightMigrationKey(role), '1');
      setState(next); setError(false);
      window.dispatchEvent(new Event(eventName));
    } catch { setError(true); }
  }, [role]);
  return { preference, resolvedTheme: resolveAppearance(preference, systemDark), setPreference, error };
}
