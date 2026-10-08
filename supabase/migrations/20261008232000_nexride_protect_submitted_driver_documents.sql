-- Protect already-submitted Driver verification evidence. Owners may
-- discard unreferenced uploads, but not delete/overwrite a stored Driver
-- license or vehicle-registration object referenced from their record.
drop policy if exists driver_verification_delete_own on storage.objects;
create policy driver_verification_delete_own
on storage.objects for delete to authenticated
using (
 bucket_id='driver-verification'
 and split_part(name,'/',1)=(select auth.uid())::text
 and not exists(
   select 1 from public.drivers d where d.id=(select auth.uid())
     and (d.license_document_path=storage.objects.name
       or d.vehicle_registration_path=storage.objects.name)
 )
);
drop policy if exists driver_verification_update_own on storage.objects;
create policy driver_verification_update_own
on storage.objects for update to authenticated
using (
 bucket_id='driver-verification'
 and split_part(name,'/',1)=(select auth.uid())::text
 and not exists(
   select 1 from public.drivers d where d.id=(select auth.uid())
     and (d.license_document_path=storage.objects.name
       or d.vehicle_registration_path=storage.objects.name)
 )
)
with check(
 bucket_id='driver-verification'
 and split_part(name,'/',1)=(select auth.uid())::text
);
