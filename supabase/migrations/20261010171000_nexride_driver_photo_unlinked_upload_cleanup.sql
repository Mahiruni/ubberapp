-- A failed verification-record insert must not strand private driver photo uploads.
-- Only the uploading driver can remove their own *unreferenced* files.
-- Referenced pending, approved, and rejected photos remain immutable to clients.
-- Apply after reviewing the existing NexRide Storage RLS policies.

begin;

drop policy if exists nexride_driver_photo_delete_unlinked_own on storage.objects;

create policy nexride_driver_photo_delete_unlinked_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'nexride-driver-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and owner_id = (select auth.uid())::text
  and not exists (
    select 1 from public.driver_profile_photos p
    where p.storage_path = storage.objects.name
  )
);

commit;
