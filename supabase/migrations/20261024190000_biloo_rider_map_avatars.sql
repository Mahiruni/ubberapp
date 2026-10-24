create table if not exists public.rider_map_avatars (
 user_id uuid primary key references auth.users(id) on delete cascade,
 design jsonb not null default '{"preset":0,"skin":2,"hair":0,"outfit":0}'::jsonb,
 updated_at timestamptz not null default now(),
 constraint rider_map_avatar_design_object check (jsonb_typeof(design)='object')
);
alter table public.rider_map_avatars enable row level security;
create policy "Riders read own map avatar" on public.rider_map_avatars for select to authenticated using (auth.uid()=user_id);
create policy "Riders insert own map avatar" on public.rider_map_avatars for insert to authenticated with check (auth.uid()=user_id);
create policy "Riders update own map avatar" on public.rider_map_avatars for update to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
