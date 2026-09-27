import { createClient } from '@supabase/supabase-js';
import { publicConfig } from './runtime-config';

export const supabase = createClient(publicConfig.supabaseUrl, publicConfig.supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
