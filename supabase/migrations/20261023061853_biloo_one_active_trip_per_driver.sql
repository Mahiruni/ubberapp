-- Database-level guard across competing bookings; existing data passed the duplicate check.
create unique index if not exists biloo_one_active_trip_per_driver
  on public.ride_requests (assigned_driver_id)
  where assigned_driver_id is not null and status in ('accepted','arrived_pickup','in_trip');
