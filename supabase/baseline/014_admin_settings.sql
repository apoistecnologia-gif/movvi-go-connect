-- APOIS CORRIDAS — CANONICAL BASELINE 014
-- Phase 8 settings hardening. Fresh-database baseline only.
-- Do not execute ad-hoc on production.

-- Browser clients never receive unrestricted SELECT access to app_settings.
-- Staff may read only explicitly allowlisted non-secret operational keys.
create or replace function public.admin_get_settings(_keys text[] default null)
returns table(key text,value jsonb,description text,updated_at timestamptz)
language sql
stable
security definer
set search_path to ''
as $$
  select s.key,s.value,s.description,s.updated_at
  from public.app_settings s
  where auth.uid() is not null
    and private.has_permission('settings.manage')
    and s.key in (
      'ride.cancellation_fee_amount',
      'ride.cancellation_free_minutes',
      'ride.next_offer_max_distance_km',
      'finance.platform_fee_percent',
      'finance.electronic_payment_provider',
      'finance.payout_provider',
      'subscription.default_plan_price'
    )
    and (_keys is null or s.key=any(_keys))
  order by s.key;
$$;

revoke all on function public.admin_get_settings(text[]) from public,anon;
grant execute on function public.admin_get_settings(text[]) to authenticated;

create or replace function public.admin_update_setting(
  _key text,
  _value jsonb
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_key text:=btrim(coalesce(_key,''));
  v_number numeric;
  v_row public.app_settings%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not private.has_permission('settings.manage') then raise exception 'forbidden' using errcode='42501'; end if;

  if v_key not in (
    'ride.cancellation_fee_amount',
    'ride.cancellation_free_minutes',
    'ride.next_offer_max_distance_km',
    'finance.platform_fee_percent'
  ) then
    raise exception 'setting_not_admin_editable' using errcode='22023';
  end if;

  begin
    v_number:=(_value #>> '{}')::numeric;
  exception when others then
    raise exception 'invalid_setting_value' using errcode='22023';
  end;

  if v_key='ride.cancellation_fee_amount' and (v_number<0 or v_number>1000) then
    raise exception 'invalid_cancellation_fee' using errcode='22023';
  elsif v_key='ride.cancellation_free_minutes' and (v_number<0 or v_number>60) then
    raise exception 'invalid_cancellation_window' using errcode='22023';
  elsif v_key='ride.next_offer_max_distance_km' and (v_number<0.5 or v_number>20) then
    raise exception 'invalid_next_offer_radius' using errcode='22023';
  elsif v_key='finance.platform_fee_percent' and (v_number<0 or v_number>100) then
    raise exception 'invalid_platform_fee_percent' using errcode='22023';
  end if;

  insert into public.app_settings(key,value,description,updated_at)
  values(
    v_key,
    to_jsonb(v_number),
    case v_key
      when 'ride.cancellation_fee_amount' then 'Valor padrão da taxa de cancelamento'
      when 'ride.cancellation_free_minutes' then 'Minutos para cancelamento sem taxa'
      when 'ride.next_offer_max_distance_km' then 'Distância máxima em km para próxima oferta durante corrida'
      when 'finance.platform_fee_percent' then 'Percentual da corrida destinado à plataforma'
    end,
    now()
  )
  on conflict(key) do update set value=excluded.value,description=excluded.description,updated_at=now()
  returning * into v_row;

  perform private.admin_audit(
    'admin.setting.updated','app_setting',v_key,
    jsonb_build_object('value',v_row.value)
  );

  return jsonb_build_object('key',v_row.key,'value',v_row.value,'updated_at',v_row.updated_at);
end;
$$;

revoke all on function public.admin_update_setting(text,jsonb) from public,anon;
grant execute on function public.admin_update_setting(text,jsonb) to authenticated;
