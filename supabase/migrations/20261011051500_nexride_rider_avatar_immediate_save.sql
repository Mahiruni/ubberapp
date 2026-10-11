-- NexRide Riders control their own portrait. No admin approval or driver-photo review record.
-- Kept private: photos are accessible only to the authenticated owner.
alter table public.profiles
  add column if not exists avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 5242880,
        array['image/jpeg','image/png','image/webp']::text[])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists nexride_rider_avatar_insert_own on storage.objects;
create policy nexride_rider_avatar_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and array_length(storage.foldername(name),1) = 1
  and name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp)$'
  and exists (
    select 1 from public.account_roles r
    join public.profiles p on p.id = r.user_id
    where r.user_id = (select auth.uid())
      and r.role = 'rider' and p.account_status = 'active'
  )
);

drop policy if exists nexride_rider_avatar_select_own on storage.objects;
create policy nexride_rider_avatar_select_own
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists nexride_rider_avatar_delete_old_own on storage.objects;
create policy nexride_rider_avatar_delete_old_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (
    select 1 from public.profiles p where p.avatar_path = storage.objects.name
  )
);
