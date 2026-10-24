-- Rider-only cosmetic map avatar. Does not change shared profile photos or Driver data.
create table if not exists public.rider_map_avatars (
 user_id uuid primary key references auth.users(id) on delete cascade,
 preset integer not null check (preset between 1 and 12),
 skin text not null check (skin in ('#9b5f40','#c98761','#e6b48c','#75442f')),
 outfit text not null check (outfit in ('#123c6b','#176c9b','#e3ad32','#356c65')),
 hair text not null check (hair in ('#211a19','#4b3024','#161d2c','#694431')),
 updated_at timestamptz not null default now()
);
alter table public.rider_map_avatars enable row level security;
create policy rider_map_avatar_select_self on public.rider_map_avatars for select to authenticated using (auth.uid()=user_id);
create policy rider_map_avatar_insert_self on public.rider_map_avatars for insert to authenticated with check (auth.uid()=user_id);
create policy rider_map_avatar_update_self on public.rider_map_avatars for update to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
