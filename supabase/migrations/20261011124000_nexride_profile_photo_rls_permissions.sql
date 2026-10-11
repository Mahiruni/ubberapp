-- Fix Rider/Driver portrait saves without changing verification or sharing private buckets.
--
-- Rider: the owner's UPDATE policy existed, but the authenticated role only
-- had SELECT on profiles. Grant only the columns the self-service profile UI
-- must write (never phone, role, account status or verification attributes).
grant update (avatar_path, full_name) on table public.profiles to authenticated;

-- Driver: storage.objects SELECT checks the assigned rider's current photo
-- through driver_profile_photos. Portrait INSERT/retirement also checks
-- storage.objects, creating recursive RLS policy expansion (42P17).
-- A narrowly scoped private helper performs the association check without
-- re-entering the driver_profile_photos RLS policy.
create or replace function private.rider_can_read_assigned_driver_photo(p_storage_path text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.driver_profile_photos p
      join public.ride_requests r on r.assigned_driver_id = p.driver_id
      where p.storage_path = p_storage_path
        and p.status = 'approved'
        and r.rider_id = (select auth.uid())
        and r.status in ('accepted','arrived_pickup','in_trip','completed')
    );
$$;

revoke all on function private.rider_can_read_assigned_driver_photo(text)
  from public, anon;
grant execute on function private.rider_can_read_assigned_driver_photo(text)
  to authenticated;

drop policy if exists nexride_driver_photo_assigned_rider_read on storage.objects;
create policy nexride_driver_photo_assigned_rider_read
on storage.objects for select to authenticated
using (
  bucket_id = 'nexride-driver-photos'
  and private.rider_can_read_assigned_driver_photo(name)
);
