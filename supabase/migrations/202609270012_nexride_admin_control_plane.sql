-- NexRide admin control plane
-- All administrative reads/mutations are protected by is_admin()/is_admin_role().
drop policy if exists drivers_admin_select on public.drivers;
create policy drivers_admin_select on public.drivers for select to authenticated using(is_admin());
drop policy if exists drivers_admin_update on public.drivers;
create policy drivers_admin_update on public.drivers for update to authenticated using(is_admin_role('super_admin') or is_admin_role('operations')) with check(is_admin_role('super_admin') or is_admin_role('operations'));
drop policy if exists payments_admin_select on public.payments;
create policy payments_admin_select on public.payments for select to authenticated using(is_admin());
drop policy if exists payouts_admin_select on public.driver_payouts;
create policy payouts_admin_select on public.driver_payouts for select to authenticated using(is_admin());
drop policy if exists ratings_admin_select on public.ratings;
create policy ratings_admin_select on public.ratings for select to authenticated using(is_admin());
drop policy if exists safety_admin_select on public.safety_reports;
create policy safety_admin_select on public.safety_reports for select to authenticated using(is_admin());
drop policy if exists support_admin_select on public.support_tickets;
create policy support_admin_select on public.support_tickets for select to authenticated using(is_admin());
drop policy if exists notifications_admin_select on public.notifications;
create policy notifications_admin_select on public.notifications for select to authenticated using(is_admin());

create or replace function public.admin_driver_review(p_driver_id uuid,p_status text)
returns public.drivers language plpgsql security definer set search_path=public as $$
declare r public.drivers;
begin
 if not (public.is_admin_role('super_admin') or public.is_admin_role('operations')) then raise exception 'forbidden'; end if;
 if p_status not in ('pending','approved','rejected','suspended') then raise exception 'invalid status'; end if;
 update public.drivers set review_status=p_status,updated_at=now(),is_online=case when p_status<>'approved' then false else is_online end where id=p_driver_id returning * into r;
 if r.id is null then raise exception 'driver_not_found'; end if;
 insert into public.admin_action_log(city_id,actor_id,action,entity_type,entity_id,metadata) values(r.city_id,auth.uid(),'driver_review_status_changed','driver',r.id,jsonb_build_object('status',p_status));
 return r;
end $$;
revoke all on function public.admin_driver_review(uuid,text) from public;
grant execute on function public.admin_driver_review(uuid,text) to authenticated;

create or replace function public.admin_cancel_trip(p_trip_id uuid,p_reason text default 'admin_intervention')
returns public.trips language plpgsql security definer set search_path=public as $$
declare r public.trips;
begin
 if not (public.is_admin_role('super_admin') or is_admin_role('operations') or is_admin_role('support')) then raise exception 'forbidden'; end if;
 update public.trips set state='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancellation_reason=left(coalesce(p_reason,'admin_intervention'),250),updated_at=now() where id=p_trip_id and state not in ('completed','cancelled') returning * into r;
 if r.id is null then raise exception 'trip_not_cancellable'; end if;
 insert into public.ride_events(trip_id,actor_id,event_type,metadata) values(r.id,auth.uid(),'admin_cancelled',jsonb_build_object('reason',p_reason));
 insert into public.admin_action_log(city_id,actor_id,action,entity_type,entity_id,metadata) values(r.city_id,auth.uid(),'trip_cancelled','trip',r.id,jsonb_build_object('reason',p_reason));
 return r;
end $$;
revoke all on function public.admin_cancel_trip(uuid,text) from public;
grant execute on function public.admin_cancel_trip(uuid,text) to authenticated;

create or replace function public.admin_safety_update(p_report_id uuid,p_status text)
returns public.safety_reports language plpgsql security definer set search_path=public as $$
declare r public.safety_reports;
begin
 if not (is_admin_role('super_admin') or is_admin_role('operations') or is_admin_role('support')) then raise exception 'forbidden'; end if;
 if p_status not in ('open','investigating','resolved','closed') then raise exception 'invalid status'; end if;
 update public.safety_reports set status=p_status,assigned_to=coalesce(assigned_to,auth.uid()),resolved_at=case when p_status in ('resolved','closed') then now() else resolved_at end,updated_at=now() where id=p_report_id returning * into r;
 insert into public.admin_action_log(city_id,actor_id,action,entity_type,entity_id,metadata) values(null,auth.uid(),'safety_status_changed','safety_report',r.id,jsonb_build_object('status',p_status));
 return r;
end $$;
revoke all on function public.admin_safety_update(uuid,text) from public;
grant execute on function public.admin_safety_update(uuid,text) to authenticated;

create index if not exists profiles_admin_role_status_idx on public.profiles(admin_role,account_status) where role='admin';