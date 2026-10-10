-- Cleanup of *unlinked* photo uploads only. Approved and submitted portraits cannot be deleted by drivers.
-- This policy was applied to the live NexRide Supabase project after RLS review on 2026-10-10.
drop policy if exists nexride_driver_photo_delete_unlinked_own on storage.objects;
create policy nexride_driver_photo_delete_unlinked_own on storage.objects for delete to authenticated
using (bucket_id = 'nexride-driver-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
 and owner_id = (select auth.uid())::text
 and not exists (select 1 from public.driver_profile_photos p where p.storage_path=storage.objects.name));
