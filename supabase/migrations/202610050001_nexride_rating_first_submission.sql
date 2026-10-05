-- Preserve the first confirmed rating under concurrent/retried requests.
-- Target: existing DriverSuperApp. Apply only after reviewing against that project.
create or replace function public.submit_trip_rating(p_trip_id uuid,p_score smallint,p_comment text default null)
returns public.ratings language plpgsql security definer set search_path=public
as $$
declare t public.trips; v public.ratings; uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_score is null or p_score<1 or p_score>5 then raise exception 'INVALID_SCORE'; end if;
 if length(coalesce(p_comment,''))>1200 then raise exception 'FEEDBACK_TOO_LONG'; end if;
 select * into t from public.trips where id=p_trip_id and state='completed' and deleted_at is null for update;
 if not found then raise exception 'TRIP_NOT_COMPLETED'; end if;
 if t.customer_id is distinct from uid and t.driver_id is distinct from uid then raise exception 'NOT_A_TRIP_PARTICIPANT'; end if;
 if t.driver_id is null then raise exception 'DRIVER_NOT_FOUND'; end if;
 select * into v from public.ratings where trip_id=t.id and rater_id=uid;
 if found then return v; end if;
 insert into public.ratings(trip_id,rater_id,ratee_id,score,comment)
 values(t.id,uid,case when uid=t.customer_id then t.driver_id else t.customer_id end,p_score,nullif(trim(p_comment),''))
 on conflict(trip_id,rater_id) do nothing returning * into v;
 if v.id is null then select * into v from public.ratings where trip_id=t.id and rater_id=uid; end if;
 return v;
end $$;
revoke all on function public.submit_trip_rating(uuid,smallint,text) from public,anon;
grant execute on function public.submit_trip_rating(uuid,smallint,text) to authenticated;
-- Stop direct inserts bypassing trip-completion/participant checks.
revoke insert,update,delete on public.ratings from authenticated;
