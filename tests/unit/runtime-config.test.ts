import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('public environment contract', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  });

  it('exports the configured public Supabase values', async () => {
    const { publicConfig } = await import('../../lib/runtime-config');
    expect(publicConfig.supabaseUrl).toBe('https://example.supabase.co');
    expect(publicConfig.supabaseKey).toBe('sb_publishable_test');
  });
});
