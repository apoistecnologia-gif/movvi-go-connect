-- APOIS Corridas — hardening operacional do SOS.
-- Mantém o contrato canônico de produção: lat/lng, status open|acknowledged|resolved|cancelled.

create or replace function apois_rpc_private.create_driver_sos(
  _lat numeric default null,
  _lng numeric default null,
  _severity text default 'critical',
  _message text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions', 'apois_rpc_private'
as $function$
declare
  v_profile_id uuid;
  v_driver public.drivers%rowtype;
  v_ride_id uuid;
  v_alert_id uuid;
  v_severity text;
  v_message text;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  v_profile_id := public.mobility_user_id();
  if v_profile_id is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select * into v_driver
  from public.drivers
  where user_id = v_profile_id
  limit 1;

  if not found then
    raise exception 'driver_profile_missing' using errcode = '42501';
  end if;

  v_severity := lower(trim(coalesce(_severity, 'critical')));
  if v_severity not in ('critical', 'high', 'medical', 'security') then
    raise exception 'invalid_sos_severity';
  end if;

  if _lat is not null and (_lat < -90 or _lat > 90) then
    raise exception 'invalid_sos_location';
  end if;
  if _lng is not null and (_lng < -180 or _lng > 180) then
    raise exception 'invalid_sos_location';
  end if;

  -- Corrida é inferida no servidor. SOS fora de corrida continua permitido por segurança.
  select r.id into v_ride_id
  from public.rides r
  where r.driver_id = v_driver.id
    and r.status in ('motorista_a_caminho', 'motorista_chegou', 'em_viagem')
  order by
    case r.status
      when 'em_viagem' then 1
      when 'motorista_chegou' then 2
      else 3
    end,
    r.accepted_at desc nulls last,
    r.created_at desc
  limit 1;

  v_message := nullif(
    left(trim(coalesce(_message, 'SOS acionado pelo motorista no aplicativo APOIS.')), 500),
    ''
  );

  insert into public.sos_alerts(
    user_id,
    driver_id,
    ride_id,
    lat,
    lng,
    message,
    severity,
    status
  )
  values (
    v_profile_id,
    v_driver.id,
    v_ride_id,
    _lat,
    _lng,
    v_message,
    v_severity,
    'open'
  )
  returning id into v_alert_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (
    v_profile_id,
    'sos.driver.created',
    case when v_ride_id is null then 'driver' else 'ride' end,
    coalesce(v_ride_id::text, v_driver.id::text),
    jsonb_build_object(
      'sos_alert_id', v_alert_id,
      'ride_id', v_ride_id,
      'driver_id', v_driver.id,
      'severity', v_severity,
      'status', 'open',
      'lat', _lat,
      'lng', _lng
    )
  );

  return jsonb_build_object(
    'ok', true,
    'alert_id', v_alert_id,
    'ride_id', v_ride_id,
    'driver_id', v_driver.id,
    'severity', v_severity,
    'status', 'open',
    'created_at', now()
  );
end;
$function$;

create or replace function public.create_driver_sos(
  _lat numeric default null,
  _lng numeric default null,
  _severity text default 'critical',
  _message text default null
)
returns jsonb
language sql
set search_path to ''
as $function$
  select apois_rpc_private.create_driver_sos($1, $2, $3, $4);
$function$;

revoke all on function apois_rpc_private.create_driver_sos(numeric, numeric, text, text) from public, anon;
grant execute on function apois_rpc_private.create_driver_sos(numeric, numeric, text, text) to authenticated, service_role;

revoke all on function public.create_driver_sos(numeric, numeric, text, text) from public, anon;
grant execute on function public.create_driver_sos(numeric, numeric, text, text) to authenticated, service_role;

-- Todas as criações de SOS de cliente passam a usar RPC validada no servidor.
drop policy if exists sos_alerts_insert_own on public.sos_alerts;
revoke insert on table public.sos_alerts from authenticated;

-- A Central de Operações já assina esta tabela; publica a fonte real no Realtime.
do $block$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication p
    join pg_catalog.pg_publication_rel pr on pr.prpubid = p.oid
    where p.pubname = 'supabase_realtime'
      and pr.prrelid = 'public.sos_alerts'::regclass
  ) then
    alter publication supabase_realtime add table public.sos_alerts;
  end if;
end;
$block$;
