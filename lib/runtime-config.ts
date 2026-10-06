const DEFAULT_SUPABASE_URL = 'https://eyyvvwecpyctttiueban.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_kXFOrtwKkKmrqCtYTTuzdg__CjjABBf';

export function requireEnv(name: string, value: string | undefined, fallback?: string): string {
  const resolved = value?.trim() || fallback?.trim();
  if (!resolved) throw new Error('Missing required environment variable: ' + name);
  return resolved;
}

export const publicConfig = {
  appName: process.env.NEXT_PUBLIC_APP_NAME || 'NexRide',
  appEnv: process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV || 'development',
  appUrl: requireEnv(
    'NEXT_PUBLIC_APP_URL',
    process.env.NEXT_PUBLIC_APP_URL,
    'https://ubberapp.vercel.app',
  ),
  supabaseUrl: requireEnv(
    'NEXT_PUBLIC_SUPABASE_URL',
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    DEFAULT_SUPABASE_URL,
  ),
  supabaseKey: requireEnv(
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    DEFAULT_SUPABASE_PUBLISHABLE_KEY,
  ),
  mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '',
};
