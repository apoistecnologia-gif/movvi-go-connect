-- APOIS CORRIDAS — CANONICAL BASELINE 009
-- Phase 6: Passenger safety, secure sharing, receipt and rating.
-- Fresh-database baseline only. Do not execute ad-hoc on production.

-- -----------------------------------------------------------------------------
-- Explicit passenger -> driver rating. The legacy rides.passenger_rating field is
-- driver -> passenger and MUST NOT be reused for the opposite direction.
-- -----------------------------------------------------------------------------
alter table public.rides
  add column if not exists passenger_driver_rating numeric(2,1) check (passenger_driver_rating between 1 and 5),
  add column if not exists passenger_driver_rating_comment text,
  add column if not exists share_expires_at timestamptz,
  add column if not exists share_revoked_at timestamptz;

-- Safety data already exists in the live project. Phase 6 ties the alert to a
-- ride and records severity without changing legacy rows destructively.
alter table public.sos_alerts
  add column if not exists ride_id uuid references public.rides(id) on delete set null,
  add column if not exists severity text not null default 'critical'
    check (severity in ('low','medium','high','critical'));
create index if not exists sos_alerts_open_created_idx
  on public.sos_alerts(status,created_at desc);
create index if not exists sos_alerts_ride_idx
  on public.sos_alerts(ride_id,created_at desc)
  where ride_id is not null;

-- Operations/admin needs to see SOS events. Passenger retains own-read/insert
-- policies from 003_rls.sql.
drop policy if exists sos_alerts_admin_read on public.sos_alerts;
create policy sos_alerts_admin_read on public.sos_alerts for select to authenticated
  using (private.has_permission('users.manage'));

-- -----------------------------------------------------------------------------
-- Passenger -> Driver rating
-- -----------------------------------------------------------------------------
create or replace function public.rate_passenger_ride(
  _ride_id uuid,
  _rating integer,
  _comment text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_passenger_id uuid;
  v_ride public.rides%rowtype;
  v_average numeric(3,2);
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  if _rating is null or _rating < 1 or _rating > 5 then
    raise exception 'rating_out_of_range' using errcode='22023';
  end if;

  v_passenger_id := public.mobility_user_id();
  if v_passenger_id is null then
    raise exception 'passenger_profile_missing' using errcode='P0002';
  end if;

  select * into v_ride
  from public.rides
  where id=_ride_id
  for update;

  if not found or v_ride.passenger_id<>v_passenger_id then
    raise exception 'ride_not_found' using errcode='P0002';
  end if;
  if v_ride.status<>'finalizada' or v_ride.driver_id is null then
    raise exception 'ride_not_completed' using errcode='P0001';
  end if;
  if v_ride.passenger_rated_at is not null or v_ride.passenger_driver_rating is not null then
    raise exception 'ride_already_rated' using errcode='23505';
  end if;

  update public.rides
  set passenger_driver_rating=_rating,
      passenger_driver_rating_comment=nullif(left(btrim(coalesce(_comment,'')),500),''),
      passenger_rated_at=now(),
      updated_at=now()
  where id=v_ride.id;

  select round(avg(r.passenger_driver_rating)::numeric,2), count(*)::integer
  into v_average,v_count
  from public.rides r
  where r.driver_id=v_ride.driver_id
    and r.status='finalizada'
    and r.passenger_driver_rating is not null;

  update public.drivers
  set rating=v_average,
      total_ratings=coalesce(v_count,0),
      updated_at=now()
  where id=v_ride.driver_id;

  return jsonb_build_object(
    'ok',true,
    'ride_id',v_ride.id,
    'rating',_rating,
    'comment_saved',nullif(btrim(coalesce(_comment,'')),'') is not null,
    'driver_average_rating',v_average,
    'driver_ratings_count',coalesce(v_count,0)
  );
end;
$$;

revoke all on function public.rate_passenger_ride(uuid,integer,text) from public,anon;
grant execute on function public.rate_passenger_ride(uuid,integer,text) to authenticated;

-- -----------------------------------------------------------------------------
-- Secure, revocable, expirable ride sharing.
-- gen_random_uuid() is backed by pgcrypto and provides a non-enumerable random
-- token. Public lookup returns only the fields necessary for live tracking.
-- -----------------------------------------------------------------------------
create or replace function public.passenger_create_or_refresh_share(
  _ride_id uuid,
  _ttl_minutes integer default 240
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_passenger_id uuid;
  v_ride public.rides%rowtype;
  v_ttl integer:=greatest(15,least(coalesce(_ttl_minutes,240),1440));
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  v_passenger_id:=public.mobility_user_id();
  if v_passenger_id is null then
    raise exception 'passenger_profile_missing' using errcode='P0002';
  end if;

  select * into v_ride
  from public.rides
  where id=_ride_id and passenger_id=v_passenger_id
  for update;
  if not found then raise exception 'ride_not_found' using errcode='P0002'; end if;
  if v_ride.status not in ('procurar_motorista','motorista_a_caminho','motorista_chegou','em_viagem') then
    raise exception 'ride_not_shareable' using errcode='P0001';
  end if;

  if v_ride.share_token is null
     or v_ride.share_revoked_at is not null
     or v_ride.share_expires_at is null
     or v_ride.share_expires_at<=now() then
    update public.rides
    set share_token=gen_random_uuid(),
        share_expires_at=now()+make_interval(mins=>v_ttl),
        share_revoked_at=null,
        updated_at=now()
    where id=v_ride.id
    returning * into v_ride;
  else
    update public.rides
    set share_expires_at=greatest(share_expires_at,now()+make_interval(mins=>v_ttl)),
        updated_at=now()
    where id=v_ride.id
    returning * into v_ride;
  end if;

  return jsonb_build_object(
    'ok',true,
    'share_token',v_ride.share_token,
    'share_expires_at',v_ride.share_expires_at
  );
end;
$$;

revoke all on function public.passenger_create_or_refresh_share(uuid,integer) from public,anon;
grant execute on function public.passenger_create_or_refresh_share(uuid,integer) to authenticated;

create or replace function public.passenger_revoke_share(_ride_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_passenger_id uuid;
  v_ride_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  v_passenger_id:=public.mobility_user_id();
  if v_passenger_id is null then raise exception 'passenger_profile_missing' using errcode='P0002'; end if;

  update public.rides
  set share_revoked_at=now(),updated_at=now()
  where id=_ride_id and passenger_id=v_passenger_id
  returning id into v_ride_id;
  if v_ride_id is null then raise exception 'ride_not_found' using errcode='P0002'; end if;

  return jsonb_build_object('ok',true,'ride_id',v_ride_id);
end;
$$;

revoke all on function public.passenger_revoke_share(uuid) from public,anon;
grant execute on function public.passenger_revoke_share(uuid) to authenticated;

create or replace function public.get_shared_passenger_ride(_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_token uuid;
  v_ride public.rides%rowtype;
begin
  begin
    v_token:=nullif(btrim(coalesce(_token,'')),'')::uuid;
  exception when invalid_text_representation then
    return jsonb_build_object('ok',false,'error','shared_ride_not_found');
  end;
  if v_token is null then return jsonb_build_object('ok',false,'error','shared_ride_not_found'); end if;

  select * into v_ride
  from public.rides
  where share_token=v_token
    and share_revoked_at is null
    and share_expires_at is not null
    and share_expires_at>now()
  limit 1;

  if not found then return jsonb_build_object('ok',false,'error','shared_ride_not_found'); end if;

  return jsonb_build_object(
    'ok',true,
    'ride',jsonb_build_object(
      'status',v_ride.status,
      'category',v_ride.category,
      'origin_name',v_ride.origin_name,
      'destination_name',v_ride.destination_name,
      'driver_name',v_ride.driver_name,
      'driver_vehicle_model',v_ride.driver_vehicle_model,
      'driver_vehicle_color',v_ride.driver_vehicle_color,
      'driver_vehicle_plate',v_ride.driver_vehicle_plate,
      'driver_latitude',v_ride.driver_latitude,
      'driver_longitude',v_ride.driver_longitude,
      'driver_heading',v_ride.driver_heading,
      'created_at',v_ride.created_at,
      'accepted_at',v_ride.accepted_at,
      'driver_arrived_at',v_ride.driver_arrived_at,
      'started_at',v_ride.started_at,
      'completed_at',v_ride.completed_at,
      'updated_at',v_ride.updated_at
    )
  );
end;
$$;

revoke all on function public.get_shared_passenger_ride(text) from public;
grant execute on function public.get_shared_passenger_ride(text) to anon,authenticated;

-- -----------------------------------------------------------------------------
-- SOS: server-side authorization, location + ride binding and operational event.
-- Admin can supervise rows through the policy above and the audit stream.
-- -----------------------------------------------------------------------------
create or replace function public.passenger_trigger_sos(
  _ride_id uuid,
  _lat numeric,
  _lng numeric,
  _severity text default 'critical',
  _message text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid;
  v_ride public.rides%rowtype;
  v_alert_id uuid;
  v_severity text:=lower(btrim(coalesce(_severity,'critical')));
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if v_severity not in ('low','medium','high','critical') then
    raise exception 'invalid_sos_severity' using errcode='22023';
  end if;
  if _lat is null or _lng is null or _lat not between -90 and 90 or _lng not between -180 and 180 then
    raise exception 'invalid_sos_location' using errcode='22023';
  end if;

  v_user_id:=public.mobility_user_id();
  if v_user_id is null then raise exception 'passenger_profile_missing' using errcode='P0002'; end if;

  select * into v_ride from public.rides
  where id=_ride_id and passenger_id=v_user_id
  limit 1;
  if not found then raise exception 'ride_not_found' using errcode='P0002'; end if;
  if v_ride.status not in ('motorista_a_caminho','motorista_chegou','em_viagem') then
    raise exception 'ride_not_in_safety_window' using errcode='P0001';
  end if;

  insert into public.sos_alerts(user_id,driver_id,ride_id,lat,lng,message,severity,status)
  values(v_user_id,v_ride.driver_id,v_ride.id,_lat,_lng,nullif(left(btrim(coalesce(_message,'')),500),''),v_severity,'open')
  returning id into v_alert_id;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(
    auth.uid(),
    'sos.triggered',
    'sos_alert',
    v_alert_id::text,
    jsonb_build_object('ride_id',v_ride.id,'severity',v_severity,'lat',_lat,'lng',_lng)
  );

  return jsonb_build_object('ok',true,'alert_id',v_alert_id,'status','open','created_at',now());
end;
$$;

revoke all on function public.passenger_trigger_sos(uuid,numeric,numeric,text,text) from public,anon;
grant execute on function public.passenger_trigger_sos(uuid,numeric,numeric,text,text) to authenticated;

-- -----------------------------------------------------------------------------
-- Receipt truth. The client must not reconstruct financial totals itself.
-- This RPC only returns a completed ride when its canonical settlement exists.
-- -----------------------------------------------------------------------------
create or replace function public.get_passenger_ride_receipt(_ride_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid;
  v_ride public.rides%rowtype;
  v_settlement public.ride_settlements%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  v_user_id:=public.mobility_user_id();
  if v_user_id is null then raise exception 'passenger_profile_missing' using errcode='P0002'; end if;

  select * into v_ride from public.rides
  where id=_ride_id and passenger_id=v_user_id
  limit 1;
  if not found then raise exception 'ride_not_found' using errcode='P0002'; end if;
  if v_ride.status<>'finalizada' then raise exception 'ride_not_completed' using errcode='P0001'; end if;

  select * into v_settlement from public.ride_settlements where ride_id=v_ride.id limit 1;
  if not found then
    return jsonb_build_object('ok',false,'error','settlement_not_available','ride_id',v_ride.id);
  end if;

  return jsonb_build_object(
    'ok',true,
    'receipt',jsonb_build_object(
      'ride_id',v_ride.id,
      'date',coalesce(v_ride.completed_at,v_ride.updated_at),
      'origin',v_ride.origin_name,
      'destination',v_ride.destination_name,
      'driver_name',v_ride.driver_name,
      'payment_method',v_settlement.payment_method,
      'gross_amount_cents',v_settlement.gross_amount_cents,
      'discount_amount_cents',v_settlement.discount_amount_cents,
      'platform_fee_cents',v_settlement.platform_fee_cents,
      'provider_fee_cents',v_settlement.payment_provider_fee_cents,
      'total_amount_cents',v_settlement.passenger_charge_cents,
      'payment_status',v_settlement.payment_status,
      'settlement_status',v_settlement.status,
      'settled_at',v_settlement.settled_at
    )
  );
end;
$$;

revoke all on function public.get_passenger_ride_receipt(uuid) from public,anon;
grant execute on function public.get_passenger_ride_receipt(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Payment methods exposed to Passenger.
-- The DB may contain historical active rows for Pix/cards while no electronic
-- provider is configured. Do not present those methods as usable until the
-- canonical finance setting explicitly names a provider.
-- -----------------------------------------------------------------------------
create or replace function public.get_passenger_payment_methods()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_provider text;
  v_methods jsonb;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;

  select nullif(lower(btrim(value #>> '{}')),'')
  into v_provider
  from public.app_settings
  where key='finance.electronic_payment_provider'
  limit 1;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',pm.id,
      'code',pm.code,
      'name',pm.name,
      'description',pm.description,
      'icon',pm.icon,
      'sort_order',coalesce(pm.sort_order,0),
      'requires_balance',coalesce(pm.requires_balance,false),
      'enabled',case
        when lower(pm.code) in ('pix','credit','credit_card','debit','debit_card') then v_provider is not null and v_provider<>'null'
        else true
      end
    ) order by coalesce(pm.sort_order,0),pm.code
  ),'[]'::jsonb)
  into v_methods
  from public.payment_methods pm
  where pm.is_active=true;

  return jsonb_build_object('ok',true,'methods',v_methods);
end;
$$;

revoke all on function public.get_passenger_payment_methods() from public,anon;
grant execute on function public.get_passenger_payment_methods() to authenticated;
