-- NexRide shared Auth identity / independent Rider + Driver onboarding.
-- NON-DESTRUCTIVE; apply only after verifying identity_schema and
-- identity_functions migrations exist on the intended NexRide project.
begin;

create table if not exists public.account_role_onboarding (
  user_id uuid not null,
  role text not null check (role in ('rider','driver')),
  status text not null check (
    (role='rider' and status in ('incomplete','completed','suspended'))
    or (role='driver' and status in
      ('incomplete','submitted','under_review','approved','rejected','suspended'))
  ),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id,role),
  constraint account_role_onboarding_membership_fk
    foreign key (user_id,role)
    references public.account_roles(user_id,role)
    on delete cascade
);

alter table public.account_role_onboarding enable row level security;
drop policy if exists account_role_onboarding_read on public.account_role_onboarding;
create policy account_role_onboarding_read on public.account_role_onboarding
  for select to authenticated
  using (user_id=(select auth.uid()) or (select private.is_admin()));
revoke all on public.account_role_onboarding from public,anon,authenticated;
grant select on public.account_role_onboarding to authenticated;

-- Keep existing approved Driver states and existing Rider access intact.
-- Only brand-new memberships start as incomplete.
insert into public.account_role_onboarding(user_id,role,status,completed_at)
select ar.user_id,ar.role,
  case
    when ar.role='rider' and u.email_confirmed_at is not null
      and length(trim(coalesce(p.full_name,''))) between 2 and 80
      and length(regexp_replace(coalesce(p.phone,''),'[^0-9]','','g')) between 7 and 15
      then 'completed'
    when ar.role='rider' then 'incomplete'
    when d.review_status='approved' then 'approved'
    when d.review_status='suspended' then 'suspended'
    when d.review_status='rejected' then 'rejected'
    when d.review_status='pending' then 'under_review'
    else 'incomplete'
  end,
  case
    when (ar.role='rider' and u.email_confirmed_at is not null
      and length(trim(coalesce(p.full_name,''))) between 2 and 80
      and length(regexp_replace(coalesce(p.phone,''),'[^0-9]','','g')) between 7 and 15)
      or (ar.role='driver' and d.review_status='approved') then now()
    else null
  end
from public.account_roles ar
join auth.users u on u.id=ar.user_id
left join public.profiles p on p.id=ar.user_id
left join public.drivers d on d.id=ar.user_id and ar.role='driver'
on conflict (user_id,role) do nothing;

create or replace function private.nexride_begin_role_onboarding()
returns trigger language plpgsql security definer set search_path=''
as $body$
begin
  insert into public.account_role_onboarding(user_id,role,status)
  values(new.user_id,new.role,'incomplete')
  on conflict(user_id,role) do nothing;
  return new;
end;
$body$;

drop trigger if exists nexride_account_role_onboarding_started on public.account_roles;
create trigger nexride_account_role_onboarding_started
after insert on public.account_roles
for each row execute function private.nexride_begin_role_onboarding();

-- Driver onboarding follows the authoritative drivers.review_status.
-- A user cannot approve themselves via account_role_onboarding.
create or replace function private.nexride_sync_driver_role_onboarding()
returns trigger language plpgsql security definer set search_path=''
as $body$
declare current_state text;
begin
  if not exists(
    select 1 from public.account_roles ar
    where ar.user_id=new.id and ar.role='driver'
  ) then return new; end if;

  current_state:=case
    when new.review_status='approved' then 'approved'
    when new.review_status='suspended' then 'suspended'
    when new.review_status='rejected' then 'rejected'
    when new.review_status='pending' then 'under_review'
    else 'incomplete'
  end;
  insert into public.account_role_onboarding(user_id,role,status,completed_at)
  values(new.id,'driver',current_state,
    case when current_state='approved' then now() else null end)
  on conflict(user_id,role) do update
    set status=excluded.status,
        completed_at=case when excluded.status='approved'
          then coalesce(public.account_role_onboarding.completed_at,now())
          else public.account_role_onboarding.completed_at end,
        updated_at=now();
  return new;
end;
$body$;

drop trigger if exists nexride_driver_role_onboarding_sync on public.drivers;
create trigger nexride_driver_role_onboarding_sync
after insert or update of review_status on public.drivers
for each row execute function private.nexride_sync_driver_role_onboarding();

-- Only a verified Auth owner who has completed required shared details
-- may complete Rider onboarding. No client UPDATE privilege is granted.
create or replace function public.account_complete_rider_onboarding()
returns text language plpgsql security definer set search_path=''
as $body$
declare
  actor uuid:=(select auth.uid());
  shared public.profiles%rowtype;
  confirmed timestamptz;
begin
  if actor is null then raise exception 'auth_required' using errcode='42501'; end if;
  select p.* into shared from public.profiles p where p.id=actor;
  if not found or shared.account_status<>'active' then
    return 'account_inactive'; end if;
  if shared.role not in ('rider','driver') or not exists(
    select 1 from public.account_roles ar
    where ar.user_id=actor and ar.role='rider'
  ) then return 'rider_not_enabled'; end if;
  select u.email_confirmed_at into confirmed from auth.users u where u.id=actor;
  if confirmed is null then return 'email_not_verified'; end if;
  if length(trim(coalesce(shared.full_name,'')))<2
    or length(trim(coalesce(shared.full_name,'')))>80
    or length(regexp_replace(coalesce(shared.phone,''),'[^0-9]','','g'))<7
    or length(regexp_replace(coalesce(shared.phone,''),'[^0-9]','','g'))>15
  then return 'profile_incomplete'; end if;

  insert into public.account_role_onboarding(user_id,role,status,completed_at)
  values(actor,'rider','completed',now())
  on conflict(user_id,role) do update
    set status=case
      when public.account_role_onboarding.status='suspended' then 'suspended'
      else 'completed' end,
    completed_at=coalesce(public.account_role_onboarding.completed_at,now()),
    updated_at=now();
  if (select status from public.account_role_onboarding
      where user_id=actor and role='rider') <> 'completed' then
    return 'rider_suspended'; end if;
  return 'ready';
end;
$body$;

revoke all on function private.nexride_begin_role_onboarding() from public,anon,authenticated;
revoke all on function private.nexride_sync_driver_role_onboarding() from public,anon,authenticated;
revoke all on function public.account_complete_rider_onboarding() from public,anon,authenticated;
grant execute on function public.account_complete_rider_onboarding() to authenticated;
commit;
