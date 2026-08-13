#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 <<'SQL'
-- Use the deterministic administrator created by admin_control_plane.sh.
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);

insert into public.app_settings(key,value,description) values
  ('subscription.default_plan_price','49.90'::jsonb,'Mensalidade de teste da Fase 8'),
  ('private.test_secret','"must-not-leak"'::jsonb,'Sentinela que nunca pode sair pelo RPC')
on conflict(key) do update set value=excluded.value,description=excluded.description,updated_at=now();

do $$
declare
  v_count integer;
  v_value text;
begin
  select count(*) into v_count
  from public.admin_get_settings(array['subscription.default_plan_price','private.test_secret']);
  if v_count <> 1 then
    raise exception 'settings allowlist returned unexpected rows: %',v_count;
  end if;

  select value #>> '{}' into v_value
  from public.admin_get_settings(array['subscription.default_plan_price']);
  if v_value <> '49.90' then
    raise exception 'subscription price read mismatch: %',v_value;
  end if;
end $$;

-- A support profile has Admin access, but not settings.manage. It must learn
-- nothing from the allowlisted settings reader.
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
do $$
declare v_count integer;
begin
  select count(*) into v_count
  from public.admin_get_settings(array['subscription.default_plan_price']);
  if v_count <> 0 then
    raise exception 'support unexpectedly read settings: %',v_count;
  end if;
end $$;

select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
select 'APOIS_ADMIN_SETTINGS_OK';
SQL
