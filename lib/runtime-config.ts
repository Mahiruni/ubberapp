export function requireEnv(name: string, value: string | undefined): string {
  if (!value || !value.trim()) throw new Error('Missing required environment variable: ' + name);
  return value.trim();
}

export const publicConfig = {
  appName: process.env.NEXT_PUBLIC_APP_NAME || 'NexRide',
  appEnv: process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV || 'development',
  appUrl: requireEnv('NEXT_PUBLIC_APP_URL', process.env.NEXT_PUBLIC_APP_URL),
  supabaseUrl: requireEnv('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseKey: requireEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '',
};
