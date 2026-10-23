alter table public.ride_requests
  add column if not exists pickup_instructions text not null default ''
  check (length(pickup_instructions)<=300);
