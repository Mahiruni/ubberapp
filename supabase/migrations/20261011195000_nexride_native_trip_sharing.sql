-- NexRide Phase 2: Native sharing tokens (hash-only, owner controlled).
-- The anonymous web endpoint validates a bearer capability server-side;
-- no direct anon/authenticated table access is granted.
create table if not exists public.nexride_trip_share_links (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.ride_requests(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  creator_role text not null check (creator_role in ('rider','driver')),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint nexride_share_valid_lifetime check (
    expires_at > created_at and expires_at <= created_at + interval '2 hours'
  )
);
create index if not exists nexride_trip_shares_owner_recent
  on public.nexride_trip_share_links(created_by,trip_id,created_at desc);
create index if not exists nexride_trip_shares_trip_active
  on public.nexride_trip_share_links(trip_id,expires_at)
  where revoked_at is null;
alter table public.nexride_trip_share_links enable row level security;
revoke all on public.nexride_trip_share_links from public,anon,authenticated;
grant all on public.nexride_trip_share_links to service_role;
comment on table public.nexride_trip_share_links is
  'Short-lived trip capability links: SHA-256 token hashes only. Service role access through strict Next.js handlers. No recipient identity collected.';
