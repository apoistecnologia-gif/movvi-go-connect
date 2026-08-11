-- APOIS CORRIDAS — P0/P1 security regression hardening
--
-- The canonical authorization boundary for a driver to inspect/act on a
-- searching ride is offered_driver_ids. candidate_driver_ids is dispatch
-- bookkeeping and must not grant client visibility or action authority.
--
-- This migration is intentionally non-destructive to ride data. The legacy
-- implementations are retained privately so the public RPC signatures remain
-- unchanged while the authorization guard is tightened.

begin;

-- 1) RLS: only explicitly offered drivers may read an unassigned ride.
drop policy if exists rides_driver_read_relevant on public.rides;
create policy rides_driver_read_relevant on public.rides
for select to authenticated
using (
  public.mobility_user_id() = any(coalesce(offered_driver_ids, '{}'::uuid[]))
  or exists (
    select 1
    from public.drivers d
    where d.user_id = public.mobility_user_id()
      and (d.id = rides.driver_id or d.id = rides.accepted_driver_id)
  )
);

-- 2) Preserve the current productive implementations under private names.
-- They are no longer directly executable by authenticated/anon clients.
alter function apois_rpc_private.driver_accept_ride(uuid)
  rename to driver_accept_ride_candidate_legacy;
alter function apois_rpc_private.driver_reject_ride(uuid)
  rename to driver_reject_ride_candidate_legacy;

alter function apois_rpc_private.driver_accept_ride_candidate_legacy(uuid)
  set search_path = pg_catalog, public, extensions;
alter function apois_rpc_private.driver_reject_ride_candidate_legacy(uuid)
  set search_path = pg_catalog, public, extensions;

revoke all on function apois_rpc_private.driver_accept_ride_candidate_legacy(uuid) from public;
revoke all on function apois_rpc_private.driver_reject_ride_candidate_legacy(uuid) from public;
revoke execute on function apois_rpc_private.driver_accept_ride_candidate_legacy(uuid) from anon, authenticated;
revoke execute on function apois_rpc_private.driver_reject_ride_candidate_legacy(uuid) from anon, authenticated;
grant execute on function apois_rpc_private.driver_accept_ride_candidate_legacy(uuid) to service_role;
grant execute on function apois_rpc_private.driver_reject_ride_candidate_legacy(uuid) to service_role;

-- 3) Recreate the private implementation names expected by the public
-- SECURITY INVOKER wrappers, now guarded by offered_driver_ids.
--
-- The currently deployed passenger dispatcher writes candidate_driver_ids and
-- offered_driver_ids together. The newer canonical dispatch engine persists the
-- remaining candidate pool separately from the offered set. To stay compatible
-- with both generations while the migration is rolling forward, the guard
-- temporarily adds the authenticated offered driver to candidate_driver_ids
-- before entering the legacy implementation. If the legacy implementation
-- fails, the statement is rolled back with the surrounding transaction.
create function apois_rpc_private.driver_accept_ride(_ride_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, apois_rpc_private
as $$
declare
  v_profile_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  v_profile_id := public.mobility_user_id();

  if not exists (
    select 1
    from public.rides r
    where r.id = _ride_id
      and r.status = 'procurar_motorista'
      and r.driver_id is null
      and r.accepted_driver_id is null
      and v_profile_id = any(coalesce(r.offered_driver_ids, '{}'::uuid[]))
      and not (v_profile_id = any(coalesce(r.rejected_driver_ids, '{}'::uuid[])))
      and (r.request_expires_at is null or r.request_expires_at > now())
  ) then
    raise exception 'ride_offer_unavailable';
  end if;

  update public.rides
  set candidate_driver_ids = case
    when v_profile_id = any(coalesce(candidate_driver_ids, '{}'::uuid[]))
      then candidate_driver_ids
    else array_append(coalesce(candidate_driver_ids, '{}'::uuid[]), v_profile_id)
  end
  where id = _ride_id;

  v_result := apois_rpc_private.driver_accept_ride_candidate_legacy(_ride_id);
  return v_result;
end;
$$;

create function apois_rpc_private.driver_reject_ride(_ride_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, apois_rpc_private
as $$
declare
  v_profile_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  v_profile_id := public.mobility_user_id();

  if not exists (
    select 1
    from public.rides r
    where r.id = _ride_id
      and r.status = 'procurar_motorista'
      and r.driver_id is null
      and r.accepted_driver_id is null
      and v_profile_id = any(coalesce(r.offered_driver_ids, '{}'::uuid[]))
  ) then
    raise exception 'ride_offer_unavailable';
  end if;

  update public.rides
  set candidate_driver_ids = case
    when v_profile_id = any(coalesce(candidate_driver_ids, '{}'::uuid[]))
      then candidate_driver_ids
    else array_append(coalesce(candidate_driver_ids, '{}'::uuid[]), v_profile_id)
  end
  where id = _ride_id;

  v_result := apois_rpc_private.driver_reject_ride_candidate_legacy(_ride_id);
  return v_result;
end;
$$;

revoke all on function apois_rpc_private.driver_accept_ride(uuid) from public;
revoke all on function apois_rpc_private.driver_reject_ride(uuid) from public;
grant execute on function apois_rpc_private.driver_accept_ride(uuid) to authenticated, service_role;
grant execute on function apois_rpc_private.driver_reject_ride(uuid) to authenticated, service_role;

-- 4) Migration-time regression assertions. Abort instead of silently widening
-- the client surface if the expected invariants are not true.
do $$
declare
  v_policy text;
begin
  select qual into v_policy
  from pg_policies
  where schemaname = 'public'
    and tablename = 'rides'
    and policyname = 'rides_driver_read_relevant';

  if v_policy is null
     or position('offered_driver_ids' in v_policy) = 0
     or position('candidate_driver_ids' in v_policy) > 0 then
    raise exception 'rides_driver_read_relevant must authorize by offered_driver_ids only';
  end if;

  if has_function_privilege('authenticated', 'apois_rpc_private.driver_accept_ride_candidate_legacy(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'apois_rpc_private.driver_reject_ride_candidate_legacy(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'apois_rpc_private.driver_accept_ride_candidate_legacy(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'apois_rpc_private.driver_reject_ride_candidate_legacy(uuid)', 'EXECUTE') then
    raise exception 'legacy driver offer implementations must not be client executable';
  end if;

  if not has_function_privilege('authenticated', 'apois_rpc_private.driver_accept_ride(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'apois_rpc_private.driver_reject_ride(uuid)', 'EXECUTE') then
    raise exception 'authenticated wrapper compatibility grant missing';
  end if;
end;
$$;

commit;
