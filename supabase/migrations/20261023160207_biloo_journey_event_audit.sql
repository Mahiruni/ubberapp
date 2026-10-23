-- Additive, admin-only event history for the EXISTING booking engine.
-- No historical events are invented or backfilled; old rides retain their
-- existing lifecycle timestamps. No money moves and no payment state changes.
create table public.ride_journey_events (
  id bigint generated always as identity primary key,
  ride_request_id uuid not null references public.ride_requests(id),
  actor_id uuid,
  event_type text not null check (event_type in (
    'requested','assigned','arrived_pickup','pickup_confirmed','trip_started',
    'completed','cancelled','withdrawn','offer_delivered','offer_accepted',
    'offer_declined','offer_expired','offer_withdrawn'
  )),
  metadata jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now()
);
create index ride_journey_events_request_time_idx
  on public.ride_journey_events(ride_request_id, recorded_at, id);
alter table public.ride_journey_events enable row level security;
revoke all on public.ride_journey_events from public, anon, authenticated, service_role;
grant select on public.ride_journey_events to authenticated, service_role;
create policy admin_reads_journey_events on public.ride_journey_events
  for select to authenticated using ((select private.is_admin()));

-- Only database triggers can append events. Functions live outside the exposed
-- API schema and have no client EXECUTE permission. Source-table RLS and the
-- existing driver transition/assignment guards authorize the triggering write.
create function private.record_biloo_journey_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare event_name text;
begin
  if tg_table_name = 'ride_requests' then
    if tg_op = 'INSERT' then event_name := 'requested';
    elsif new.status is not distinct from old.status then return new;
    else event_name := case new.status
      when 'accepted' then 'assigned' when 'arrived_pickup' then 'arrived_pickup'
      when 'in_trip' then 'trip_started' when 'completed' then 'completed'
      when 'cancelled' then 'cancelled' when 'withdrawn' then 'withdrawn' end;
    end if;
    if event_name is not null then
      insert into public.ride_journey_events(ride_request_id,actor_id,event_type,metadata)
      values(new.id,auth.uid(),event_name,jsonb_strip_nulls(jsonb_build_object(
        'status',new.status,'driver_id',new.assigned_driver_id,
        'payment_status',new.payment_status,'payment_method',new.payment_method,
        'final_fare_etb',new.final_fare_etb,'cancellation_reason',new.cancellation_reason)));
      if event_name = 'trip_started' then
        insert into public.ride_journey_events(ride_request_id,actor_id,event_type,metadata)
        values(new.id,auth.uid(),'pickup_confirmed',jsonb_build_object('source','driver_start_confirmation'));
      end if;
    end if;
  elsif tg_table_name = 'ride_request_offers' then
    if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;
    event_name := case new.status when 'pending' then 'offer_delivered'
      when 'accepted' then 'offer_accepted' when 'declined' then 'offer_declined'
      when 'expired' then 'offer_expired' when 'withdrawn' then 'offer_withdrawn' end;
    if event_name is not null then
      insert into public.ride_journey_events(ride_request_id,actor_id,event_type,metadata)
      values(new.request_id,auth.uid(),event_name,jsonb_strip_nulls(jsonb_build_object(
        'offer_id',new.id,'driver_id',new.driver_id,'expires_at',new.expires_at)));
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.record_biloo_journey_event() from public, anon, authenticated, service_role;
create trigger biloo_record_journey_event after insert or update of status on public.ride_requests
  for each row execute function private.record_biloo_journey_event();
create trigger biloo_record_offer_event after insert or update of status on public.ride_request_offers
  for each row execute function private.record_biloo_journey_event();
