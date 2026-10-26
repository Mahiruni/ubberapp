import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('public environment contract', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('exports the configured public Supabase values', async () => {
    const { publicConfig } = await import('../../lib/runtime-config');
    expect(publicConfig.supabaseUrl).toBe('https://example.supabase.co');
    expect(publicConfig.supabaseKey).toBe('sb_publishable_test');
  });

  it('requires an explicit backend URL instead of silently selecting another project', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', undefined);
    await expect(import('../../lib/runtime-config')).rejects.toThrow('Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL');
  });

  it('requires a public key rather than falling back to a different project key', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', undefined);
    await expect(import('../../lib/runtime-config')).rejects.toThrow('Missing required environment variable: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  });

  it('keeps an explicitly configured legacy anonymous key compatible', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', undefined);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'explicit-unit-test-anon-key');
    const { publicConfig } = await import('../../lib/runtime-config');
    expect(publicConfig.supabaseUrl).toBe('https://example.supabase.co');
    expect(publicConfig.supabaseKey).toBe('explicit-unit-test-anon-key');
  });
});
