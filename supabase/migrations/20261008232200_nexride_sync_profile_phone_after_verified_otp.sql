-- Keep Rider and Driver contact phone synchronized with Auth only after
-- successful OTP verification. The role-specific settings screens must not
-- write unverified replacements to profiles.phone.
create or replace function public.account_sync_verified_phone()
returns text language plpgsql security definer set search_path=''
as $body$
declare actor uuid:=(select auth.uid()); normalized text; verified_time timestamptz;
begin
 if actor is null then raise exception 'auth_required' using errcode='42501'; end if;
 select private.normalize_et_phone(u.phone),u.phone_confirmed_at
 into normalized,verified_time from auth.users u where u.id=actor;
 if normalized is null or verified_time is null then return 'unverified'; end if;
 begin
  insert into public.account_verified_phones(user_id,phone_e164,verified_at)
   values(actor,normalized,verified_time)
  on conflict(user_id) do update set phone_e164=excluded.phone_e164,verified_at=excluded.verified_at;
 exception when unique_violation then return 'ownership_review_required'; end;
 update public.profiles set phone=normalized where id=actor and phone is distinct from normalized;
 delete from private.nexride_phone_change_reservations where user_id=actor;
 return 'verified';
end;
$body$;
revoke all on function public.account_sync_verified_phone() from public,anon,authenticated;
grant execute on function public.account_sync_verified_phone() to authenticated;
