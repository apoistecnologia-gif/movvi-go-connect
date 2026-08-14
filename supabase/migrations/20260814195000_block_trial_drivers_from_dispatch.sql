-- APOIS Corridas: dispatch must never offer/reserve a ride to bootstrap/trial status.
-- A driver is eligible only when the paid subscription is active.

CREATE OR REPLACE FUNCTION public.append_nearby_busy_driver_candidates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_radius_km numeric := 5;
  v_extra uuid[] := '{}'::uuid[];
begin
  if new.status <> 'procurar_motorista'
     or new.driver_id is not null
     or new.origin_lat is null
     or new.origin_lng is null then
    return new;
  end if;

  begin
    select coalesce((value #>> '{}')::numeric, 5)
      into v_radius_km
    from public.app_settings
    where key='ride.next_offer_max_distance_km';
  exception when others then
    v_radius_km := 5;
  end;
  v_radius_km := greatest(0.5, least(coalesce(v_radius_km,5), 20));

  select coalesce(array_agg(x.user_id), '{}'::uuid[])
    into v_extra
  from (
    select d.user_id
    from public.drivers d
    where d.is_online = true
      and d.approval_status = 'aprovado'
      and lower(coalesce(d.subscription_status,'')) in ('active','ativa')
      and d.category = new.category
      and d.current_lat is not null
      and d.current_lng is not null
      and d.last_location_at is not null
      and d.last_location_at >= now() - interval '120 seconds'
      and not (d.user_id = any(coalesce(new.rejected_driver_ids,'{}'::uuid[])))
      and exists (
        select 1
        from public.rides current_ride
        where current_ride.driver_id=d.id
          and current_ride.status='em_viagem'
      )
      and not exists (
        select 1
        from public.rides queued_ride
        where queued_ride.driver_id=d.id
          and queued_ride.status='procurar_motorista'
          and queued_ride.queued_after_ride_id is not null
      )
      and (
        6371 * acos(
          least(1, greatest(-1,
            cos(radians(new.origin_lat::double precision))
            * cos(radians(d.current_lat::double precision))
            * cos(radians(d.current_lng::double precision) - radians(new.origin_lng::double precision))
            + sin(radians(new.origin_lat::double precision))
            * sin(radians(d.current_lat::double precision))
          ))
        )
      ) <= v_radius_km
    order by (
      6371 * acos(
        least(1, greatest(-1,
          cos(radians(new.origin_lat::double precision))
          * cos(radians(d.current_lat::double precision))
          * cos(radians(d.current_lng::double precision) - radians(new.origin_lng::double precision))
          + sin(radians(new.origin_lat::double precision))
          * sin(radians(d.current_lat::double precision))
        ))
      )
    ) asc
    limit 5
  ) x;

  if cardinality(v_extra) > 0 then
    select coalesce(array_agg(distinct candidate_id), '{}'::uuid[])
      into new.candidate_driver_ids
    from unnest(coalesce(new.candidate_driver_ids,'{}'::uuid[]) || v_extra) candidate_id;

    select coalesce(array_agg(distinct offered_id), '{}'::uuid[])
      into new.offered_driver_ids
    from unnest(coalesce(new.offered_driver_ids,'{}'::uuid[]) || v_extra) offered_id;
  end if;

  return new;
end;
$function$;
