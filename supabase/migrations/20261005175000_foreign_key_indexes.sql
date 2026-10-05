begin;

create index if not exists admin_action_log_actor_idx
  on public.admin_action_log(actor_id);

create index if not exists ride_driver_locations_driver_idx
  on public.ride_driver_locations(driver_id);

create index if not exists ride_ratings_rater_idx
  on public.ride_ratings(rater_id);

commit;
