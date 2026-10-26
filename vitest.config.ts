import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'unit-test-public-key',
    },
    include: ['tests/unit/**/*.test.ts', 'lib/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**', '.next/**'],
  },
});
