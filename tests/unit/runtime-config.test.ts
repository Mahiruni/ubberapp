import { afterEach, describe, expect, it } from 'vitest';
import { publicConfig } from '../../lib/runtime-config';

describe('public environment contract', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  });

  it('exports the configured public Supabase values', () => {
    expect(publicConfig.supabaseUrl).toBeTruthy();
    expect(publicConfig.supabaseKey).toBeTruthy();
  });
});
