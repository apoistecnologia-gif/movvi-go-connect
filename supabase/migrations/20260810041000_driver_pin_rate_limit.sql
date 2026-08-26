-- APOIS CORRIDAS — harden the 4-digit ride security code (PIN).
-- Non-destructive migration: extends the canonical rides contract and replaces
-- driver_start_ride with a transactional attempt counter, temporary lock and
-- backend audit trail. The passenger-visible code itself is never written to
-- audit_logs.

alter table public.rides
  add column if not exists security_code_failed_attempts integer not null default 0,
  add column if not exists security_code_locked_until timestamptz,
  add column if not exists security_code_last_failed_at timestamptz;

comment on column public.rides.security_code_failed_attempts is
  'Failed PIN attempts in the current retry window. Reset after success or temporary lock.';
comment on column public.rides.security_code_locked_until is
  'Blocks PIN validation until this instant after repeated failures.';
comment on column public.rides.security_code_last_failed_at is
  'Timestamp of the latest invalid PIN attempt; does not store the attempted code.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.rides'::regclass
      and conname = 'rides_security_code_failed_attempts_nonnegative'
  ) then
    alter table public.rides
      add constraint rides_security_code_failed_attempts_nonnegative
      check (security_code_failed_attempts >= 0);
  end if;
end
$$;

create or replace function public.driver_start_ride(_ride_id uuid, _security_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := public.mobility_user_id();
  v_driver_id uuid;
  v_ride public.rides%rowtype;
  v_now timestamptz := clock_timestamp();
  v_attempt integer;
  v_remaining integer;
  v_lock_until timestamptz;
  v_retry_after integer;
  c_max_attempts constant integer := 5;
  c_lock_interval constant interval := interval '10 minutes';
begin
  if v_user_id is null then
    raise exception 'driver_profile_missing';
  end if;

  select d.id
    into v_driver_id
  from public.drivers d
  where d.user_id = v_user_id;

  if v_driver_id is null then
    raise exception 'driver_profile_missing';
  end if;

  select r.*
    into v_ride
  from public.rides r
  where r.id = _ride_id
    and r.driver_id = v_driver_id
  for update;

  if not found or v_ride.status <> 'motorista_chegou' then
    raise exception 'invalid_ride_transition';
  end if;

  if v_ride.security_code_locked_until is not null
     and v_ride.security_code_locked_until > v_now then
    v_retry_after := greatest(
      1,
      ceil(extract(epoch from (v_ride.security_code_locked_until - v_now)))::integer
    );

    insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
    values (
      v_user_id,
      'ride_security_code_locked_attempt',
      'ride',
      v_ride.id::text,
      jsonb_build_object(
        'driver_id', v_driver_id,
        'retry_after_seconds', v_retry_after
      )
    );

    return jsonb_build_object(
      'ok', false,
      'code', 'security_code_temporarily_locked',
      'retry_after_seconds', v_retry_after,
      'remaining_attempts', 0
    );
  end if;

  if trim(coalesce(_security_code, '')) is distinct from trim(coalesce(v_ride.security_code, '')) then
    -- If a previous lock already expired, start a new retry window cleanly.
    v_attempt := case
      when v_ride.security_code_locked_until is not null
       and v_ride.security_code_locked_until <= v_now then 1
      else coalesce(v_ride.security_code_failed_attempts, 0) + 1
    end;

    if v_attempt >= c_max_attempts then
      v_lock_until := v_now + c_lock_interval;
      v_retry_after := ceil(extract(epoch from c_lock_interval))::integer;
      v_remaining := 0;

      update public.rides
      set security_code_failed_attempts = 0,
          security_code_locked_until = v_lock_until,
          security_code_last_failed_at = v_now,
          updated_at = v_now
      where id = v_ride.id;
    else
      v_remaining := c_max_attempts - v_attempt;

      update public.rides
      set security_code_failed_attempts = v_attempt,
          security_code_locked_until = null,
          security_code_last_failed_at = v_now,
          updated_at = v_now
      where id = v_ride.id;
    end if;

    insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
    values (
      v_user_id,
      case when v_lock_until is null
        then 'ride_security_code_failed'
        else 'ride_security_code_temporarily_locked'
      end,
      'ride',
      v_ride.id::text,
      jsonb_build_object(
        'driver_id', v_driver_id,
        'attempt_number', v_attempt,
        'max_attempts', c_max_attempts,
        'remaining_attempts', v_remaining,
        'locked_until', v_lock_until
      )
    );

    if v_lock_until is not null then
      return jsonb_build_object(
        'ok', false,
        'code', 'security_code_temporarily_locked',
        'retry_after_seconds', v_retry_after,
        'remaining_attempts', 0
      );
    end if;

    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_security_code',
      'remaining_attempts', v_remaining
    );
  end if;

  update public.rides
  set status = 'em_viagem',
      started_at = coalesce(started_at, v_now),
      security_code_failed_attempts = 0,
      security_code_locked_until = null,
      security_code_last_failed_at = null,
      updated_at = v_now
  where id = v_ride.id
    and driver_id = v_driver_id
    and status = 'motorista_chegou'
  returning * into v_ride;

  if not found then
    raise exception 'invalid_ride_transition';
  end if;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (
    v_user_id,
    'ride_security_code_verified',
    'ride',
    v_ride.id::text,
    jsonb_build_object('driver_id', v_driver_id)
  );

  return to_jsonb(v_ride);
end;
$function$;

revoke all on function public.driver_start_ride(uuid, text) from public;
grant execute on function public.driver_start_ride(uuid, text) to authenticated;
grant execute on function public.driver_start_ride(uuid, text) to service_role;
