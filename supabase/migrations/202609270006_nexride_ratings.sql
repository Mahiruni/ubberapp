-- NexRide secure post-trip rating
create or replace function public.submit_trip_rating(p_trip_id uuid,p_score smallint,p_comment text default null)
returns public.ratings language plpgsql security definer set search_path=public
as $$
declare t public.trips; v public.ratings;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_score<1 or p_score>5 then raise exception 'INVALID_SCORE'; end if;
 select * into t from public.trips where id=p_trip_id and state='completed';
 if not found then raise exception 'TRIP_NOT_COMPLETED'; end if;
 if t.customer_id<>auth.uid() and t.driver_id<>auth.uid() then raise exception 'NOT_A_TRIP_PARTICIPANT'; end if;
 if t.driver_id is null then raise exception 'DRIVER_NOT_FOUND'; end if;
 insert into public.ratings(trip_id,rater_id,ratee_id,score,comment)
 values(t.id,auth.uid(),case when auth.uid()=t.customer_id then t.driver_id else t.customer_id end,p_score,nullif(trim(p_comment),''))
 on conflict(trip_id,rater_id) do update set score=excluded.score,comment=excluded.comment
 returning * into v;
 return v;
end $$;
revoke all on function public.submit_trip_rating(uuid,smallint,text) from public;
grant execute on function public.submit_trip_rating(uuid,smallint,text) to authenticated;
