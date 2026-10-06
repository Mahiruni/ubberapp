begin;

create unique index if not exists driver_earnings_ledger_ride_type_unique_idx
  on public.driver_earnings_ledger(ride_request_id, entry_type)
  where ride_request_id is not null
    and entry_type in ('gross_fare','driver_earning');

create or replace function private.post_completed_ride_earnings()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  gross numeric;
  earning numeric;
begin
  if old.status is distinct from new.status
     and new.status='completed'
     and new.assigned_driver_id is not null then

    gross := coalesce(new.final_fare_etb, new.estimated_trip_fare_etb);
    earning := new.estimated_driver_payout_etb;

    if gross is not null and gross >= 0 then
      insert into public.driver_earnings_ledger(
        driver_id, ride_request_id, entry_type, amount_etb, status, label, details, effective_at
      ) values (
        new.assigned_driver_id,new.id,'gross_fare',gross,'posted','Ride fare',
        jsonb_build_object(
          'source','ride_request',
          'payment_method',new.payment_method,
          'payment_status',new.payment_status
        ),
        coalesce(new.completed_at,now())
      )
      on conflict (ride_request_id, entry_type)
      where ride_request_id is not null
        and entry_type in ('gross_fare','driver_earning')
      do nothing;
    end if;

    if earning is not null and earning >= 0 then
      insert into public.driver_earnings_ledger(
        driver_id, ride_request_id, entry_type, amount_etb, status, label, details, effective_at
      ) values (
        new.assigned_driver_id,new.id,'driver_earning',earning,'posted','Driver earning',
        jsonb_build_object(
          'source','ride_request.estimated_driver_payout_etb',
          'gross_fare_etb',gross
        ),
        coalesce(new.completed_at,now())
      )
      on conflict (ride_request_id, entry_type)
      where ride_request_id is not null
        and entry_type in ('gross_fare','driver_earning')
      do nothing;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists ride_request_post_completed_earnings on public.ride_requests;
create trigger ride_request_post_completed_earnings
after update of status on public.ride_requests
for each row execute function private.post_completed_ride_earnings();

revoke all on function private.post_completed_ride_earnings()
  from public,anon,authenticated;

commit;
