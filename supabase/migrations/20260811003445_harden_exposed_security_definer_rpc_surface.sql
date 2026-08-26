-- APOIS CORRIDAS P0 security hardening.
-- Keep public RPC contracts stable while moving privileged implementations
-- out of the exposed API schema. Public wrappers remain SECURITY INVOKER.

create schema if not exists apois_rpc_private authorization postgres;
revoke all on schema apois_rpc_private from public;
grant usage on schema apois_rpc_private to anon, authenticated, service_role;

DO $migration$
DECLARE
  r record;
  v_count integer;
  v_call_args text;
  v_private_sig text;
  v_public_sig text;
BEGIN
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and (
      has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE')
    );

  -- The reviewed production surface contains exactly 27 client-callable
  -- SECURITY DEFINER RPCs. Abort rather than silently harden an unreviewed set.
  -- Zero makes the migration safe to re-run after it has already completed.
  if v_count not in (0, 27) then
    raise exception 'unexpected exposed SECURITY DEFINER RPC count: %, expected 27 or 0', v_count;
  end if;

  if v_count = 0 then
    return;
  end if;

  for r in
    select
      p.oid,
      p.proname,
      p.proargtypes,
      oidvectortypes(p.proargtypes) as identity_types,
      pg_get_function_arguments(p.oid) as full_args,
      pg_get_function_result(p.oid) as result_type,
      p.pronargs,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
      has_function_privilege('service_role', p.oid, 'EXECUTE') as service_exec
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and (
        has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
    order by p.proname, oidvectortypes(p.proargtypes)
  loop
    if exists (
      select 1
      from pg_proc p2
      join pg_namespace n2 on n2.oid = p2.pronamespace
      where n2.nspname = 'apois_rpc_private'
        and p2.proname = r.proname
        and p2.proargtypes = r.proargtypes
    ) then
      raise exception 'private implementation already exists for apois_rpc_private.%(%)', r.proname, r.identity_types;
    end if;

    v_public_sig := format('public.%I(%s)', r.proname, r.identity_types);
    v_private_sig := format('apois_rpc_private.%I(%s)', r.proname, r.identity_types);

    execute format('alter function %s set schema apois_rpc_private', v_public_sig);

    -- Remove inherited/direct client grants from the privileged implementation,
    -- then restore only the roles that were intentionally allowed on the RPC.
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_private_sig);
    if r.anon_exec then
      execute format('grant execute on function %s to anon', v_private_sig);
    end if;
    if r.auth_exec then
      execute format('grant execute on function %s to authenticated', v_private_sig);
    end if;
    if r.service_exec then
      execute format('grant execute on function %s to service_role', v_private_sig);
    end if;

    select coalesce(string_agg(format('$%s', i), ', ' order by i), '')
      into v_call_args
    from generate_series(1, r.pronargs) as g(i);

    execute format(
      'create function public.%I(%s) returns %s language sql security invoker set search_path = '''' as $wrapper$ select apois_rpc_private.%I(%s); $wrapper$',
      r.proname,
      r.full_args,
      r.result_type,
      r.proname,
      v_call_args
    );

    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_public_sig);
    if r.anon_exec then
      execute format('grant execute on function %s to anon', v_public_sig);
    end if;
    if r.auth_exec then
      execute format('grant execute on function %s to authenticated', v_public_sig);
    end if;
    if r.service_exec then
      execute format('grant execute on function %s to service_role', v_public_sig);
    end if;
  end loop;
END
$migration$;

-- ride_security_secrets intentionally has no client-readable rows. Make the
-- deny-by-default intent explicit so future permissive policies cannot open it.
DO $policy$
BEGIN
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ride_security_secrets'
      and policyname = 'ride_security_secrets_deny_clients'
  ) then
    execute $sql$
      create policy ride_security_secrets_deny_clients
      on public.ride_security_secrets
      as restrictive
      for all
      to anon, authenticated
      using (false)
      with check (false)
    $sql$;
  end if;
END
$policy$;
