# NexRide Environment System

## Environment tiers

Development uses local .env.local only. Preview/Staging uses Vercel Preview variables and staging providers. Production uses Vercel Production variables and live providers.

Vercel environment variables are scoped to Development, Preview, and Production. Changed values require a new deployment. Public NEXT_PUBLIC_* variables are embedded into the client bundle at build time, so they must be correct before the build starts.

## Public variables

Required:
- NEXT_PUBLIC_APP_NAME
- NEXT_PUBLIC_APP_ENV
- NEXT_PUBLIC_APP_URL
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- NEXT_PUBLIC_MAPBOX_TOKEN when maps/routing are enabled

The browser-safe Supabase key is a publishable key. It is not a password; RLS must protect every exposed table.

## Server-only variables

Never prefix backend credentials with NEXT_PUBLIC_.

Core:
- APP_ENV
- APP_URL
- SUPABASE_URL
- SUPABASE_SECRET_KEY

Optional provider groups are controlled by:
- NEXRIDE_MAPS_ENABLED
- NEXRIDE_PAYMENTS_ENABLED
- NEXRIDE_SMS_ENABLED
- NEXRIDE_PUSH_ENABLED
- NEXRIDE_REDIS_ENABLED

When a group is enabled, configure its documented provider credentials in the hosting platform. The names and placeholders are in .env.example.

## Code enforcement

lib/runtime-config.ts validates critical browser configuration and fails loudly when it is missing. This replaces the previous silent-null Supabase client.

lib/server-config.ts provides requireServerEnv, optionalServerEnv, and requireServiceEnv for API routes, server actions, and other trusted server code. Keep this module out of Client Components.

## Vercel

In the NexRide Vercel project, add the real values under Settings > Environment Variables and select the correct environment for each variable.

Production:
- live Supabase project
- live application URL
- restricted public map token
- live payment credentials when enabled
- live SMS/push credentials when enabled
- production Redis when enabled

Preview:
- staging Supabase project/branch
- staging URL
- sandbox payment/SMS credentials
- non-production Redis

Development:
- local Supabase/staging credentials
- local URL
- sandbox provider credentials

Never commit real .env files. .gitignore excludes them and .env.example is the only environment file intended for Git.

## Supabase

Use a publishable key in the browser and a secret key only on trusted servers/Edge Functions. Supabase recommends the modern publishable/secret key pair for new integrations and is deprecating legacy anon/service_role keys by the end of 2026.

## Rotation

Rotate credentials at the provider, update the corresponding hosting-platform variable, and redeploy. No source-code change should be required.

## CI/CD

CI should use only the minimum non-sensitive values needed for tests/builds. Production credentials stay in Vercel and Supabase secret stores, not GitHub workflow files.

Once package-lock.json is committed, switch CI installation to npm ci for deterministic dependency resolution.
