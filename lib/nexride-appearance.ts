'use client';

import { useCallback, useEffect, useState } from 'react';

export type AppearancePreference = 'light' | 'dark' | 'system';
export type Appearance = 'light' | 'dark';
const eventName = 'nexride:appearance-change';
export function appearanceKey(role: 'rider' | 'driver') { return `nexride.${role}.theme`; }
const lightMigrationKey = (role: 'rider' | 'driver') => `nexride.${role}.aurora-light-v1`;
export function resolveAppearance(preference: AppearancePreference, systemDark: boolean): Appearance {
  return preference === 'system' ? systemDark ? 'dark' : 'light' : preference;
}
export function useAppearance(role: 'rider' | 'driver') {
  // Start Rider and Driver in the light Aurora palette; dark is opt-in violet, never black.
  const fallback: AppearancePreference = 'light';
  const [preference, setState] = useState<AppearancePreference>(fallback);
  const [systemDark, setSystemDark] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const read = () => {
      try {
        const migrated = localStorage.getItem(lightMigrationKey(role)) === '1';
        if (!migrated) {
          // One-time removal of the previously forced black default, including
          // persisted Midnight settings. Future explicit preferences remain intact.
          localStorage.setItem(appearanceKey(role), 'light');
          localStorage.setItem(lightMigrationKey(role), '1');
          setState('light');
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
      localStorage.setItem(lightMigrationKey(role), '1');
      setState(next); setError(false);
      window.dispatchEvent(new Event(eventName));
    } catch { setError(true); }
  }, [role]);
  return { preference, resolvedTheme: resolveAppearance(preference, systemDark), setPreference, error };
}
