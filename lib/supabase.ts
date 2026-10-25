import { createClient } from '@supabase/supabase-js';
import { publicConfig } from './runtime-config';
import { createDriverAuthStorage, hasNativeDriverSessionBridge } from './biloo-native-auth-storage';

const authStorageKey = `sb-${new URL(publicConfig.supabaseUrl).hostname.split('.')[0]}-auth-token`;

export const supabase = createClient(publicConfig.supabaseUrl, publicConfig.supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: authStorageKey,
    ...(typeof window !== 'undefined' && hasNativeDriverSessionBridge() ? { storage: createDriverAuthStorage({
      key: authStorageKey,
      origin: new URL(publicConfig.supabaseUrl).origin,
      publishableKey: publicConfig.supabaseKey,
      local: () => window.localStorage,
    }) } : {}),
  },
});
