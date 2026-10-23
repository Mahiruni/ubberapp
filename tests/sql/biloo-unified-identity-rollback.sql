begin;
do $qa$
declare owner_id uuid:=gen_random_uuid(); total integer; result text;
begin
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
  values(owner_id,'biloo-identity-qa-'||owner_id::text||'@example.invalid',now(),
    jsonb_build_object('role','rider','full_name','QA Shared Account','phone','+251912000021'));
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  set local role authenticated;
  result:=public.account_begin_driver_application();
  if result<>'ready' then raise exception 'QA_DRIVER_ACTIVATION_FAILED'; end if;
  result:=public.account_begin_driver_application();
  select count(*) into total from public.drivers where id=owner_id;
  if total<>1 then raise exception 'QA_DUPLICATE_DRIVER_PROFILE'; end if;
  select count(*) into total from public.account_roles where user_id=owner_id and role in ('rider','driver');
  if total<>2 then raise exception 'QA_DUAL_ROLES_FAILED'; end if;
  reset role;
  select count(*) into total from auth.users where id=owner_id;
  if total<>1 then raise exception 'QA_DUPLICATE_AUTH_IDENTITY'; end if;
end;
$qa$;
rollback;
select 'PASS: existing Rider applies as Driver under one Auth UUID; both memberships exist; repeated application creates no duplicate profile or identity. All fixtures rolled back.' as result;
