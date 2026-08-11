-- Move implementacoes administrativas privilegiadas para schema nao exposto
-- e mantem no public apenas wrappers SECURITY INVOKER, seguindo o padrao
-- ja usado por admin_set_driver_approval.

create schema if not exists apois_rpc_private;
grant usage on schema apois_rpc_private to authenticated;

-- As funcoes abaixo ja existem neste ponto da baseline. Mover preserva a
-- implementacao validada e evita duplicacao/divergencia de regra de negocio.
alter function public.admin_set_driver_suspension(uuid,boolean,text) set schema apois_rpc_private;
alter function public.admin_set_passenger_status(uuid,text,text) set schema apois_rpc_private;
alter function public.admin_update_ride_category(uuid,text,text,text,text,text,text,integer,boolean) set schema apois_rpc_private;
alter function public.admin_upsert_tariff_rule(text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,boolean) set schema apois_rpc_private;
alter function public.admin_set_staff_profile(uuid,public.app_role,boolean,text) set schema apois_rpc_private;
alter function public.admin_provision_staff(uuid,public.app_role,text) set schema apois_rpc_private;
alter function public.admin_update_sos_alert(uuid,text) set schema apois_rpc_private;
alter function public.admin_update_support_ticket(uuid,text,text) set schema apois_rpc_private;
alter function public.admin_get_dashboard_metrics() set schema apois_rpc_private;
alter function public.admin_get_finance_summary(timestamptz,timestamptz) set schema apois_rpc_private;

-- Mutacoes que antes dependiam de RLS no caller passam a executar como o
-- owner somente depois das validacoes auth.uid() + private.has_permission que
-- ja existem dentro de cada implementacao.
alter function apois_rpc_private.admin_set_driver_suspension(uuid,boolean,text) security definer;
alter function apois_rpc_private.admin_set_passenger_status(uuid,text,text) security definer;
alter function apois_rpc_private.admin_update_ride_category(uuid,text,text,text,text,text,text,integer,boolean) security definer;
alter function apois_rpc_private.admin_upsert_tariff_rule(text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,boolean) security definer;
alter function apois_rpc_private.admin_set_staff_profile(uuid,public.app_role,boolean,text) security definer;

-- Public API: wrappers sem privilegio elevado e com os nomes de parametros
-- preservados para manter compatibilidade PostgREST/Supabase RPC.
create function public.admin_set_driver_suspension(
  _driver_id uuid,
  _suspended boolean,
  _reason text default null
) returns jsonb language sql set search_path='' as
$$ select apois_rpc_private.admin_set_driver_suspension($1,$2,$3); $$;

create function public.admin_set_passenger_status(
  _passenger_id uuid,
  _action text,
  _reason text default null
) returns jsonb language sql set search_path='' as
$$ select apois_rpc_private.admin_set_passenger_status($1,$2,$3); $$;

create function public.admin_update_ride_category(
  _category_id uuid,
  _name text,
  _description text,
  _icon text,
  _image_url text,
  _capacity_label text,
  _eta_label text,
  _sort_order integer,
  _is_active boolean
) returns jsonb language sql set search_path='' as
$$ select apois_rpc_private.admin_update_ride_category($1,$2,$3,$4,$5,$6,$7,$8,$9); $$;

create function public.admin_upsert_tariff_rule(
  _category_code text,
  _city text,
  _base_fare numeric,
  _min_fare numeric,
  _per_km numeric,
  _per_min numeric,
  _stop_fee numeric,
  _fixed_fee numeric,
  _dynamic_multiplier numeric,
  _helper1_fee numeric,
  _helper2_fee numeric,
  _heavy_furniture_fee numeric,
  _assembly_fee numeric,
  _packing_fee numeric,
  _difficult_access_fee numeric,
  _stair_fee numeric,
  _heavy_vehicle_fee numeric,
  _accident_fee numeric,
  _platform_fee numeric,
  _locked_wheels_fee numeric,
  _garage_fee numeric,
  _max_weight_kg numeric,
  _per_kg numeric,
  _is_active boolean
) returns jsonb language sql set search_path='' as
$$ select apois_rpc_private.admin_upsert_tariff_rule($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24); $$;

create function public.admin_set_staff_profile(
  _auth_user_id uuid,
  _role public.app_role,
  _active boolean,
  _display_name text default null
) returns jsonb language sql set search_path='' as
$$ select apois_rpc_private.admin_set_staff_profile($1,$2,$3,$4); $$;

create function public.admin_provision_staff(
  _auth_user_id uuid,
  _role public.app_role,
  _display_name text default null
) returns jsonb language sql set search_path='' as
$$ select apois_rpc_private.admin_provision_staff($1,$2,$3); $$;

create function public.admin_update_sos_alert(
  _alert_id uuid,
  _status text
) returns jsonb language sql set search_path='' as
$$ select apois_rpc_private.admin_update_sos_alert($1,$2); $$;

create function public.admin_update_support_ticket(
  _ticket_id uuid,
  _status text,
  _priority text
) returns jsonb language sql set search_path='' as
$$ select apois_rpc_private.admin_update_support_ticket($1,$2,$3); $$;

create function public.admin_get_dashboard_metrics()
returns jsonb language sql set search_path='' as
$$ select apois_rpc_private.admin_get_dashboard_metrics(); $$;

create function public.admin_get_finance_summary(
  _from timestamptz,
  _to timestamptz
) returns jsonb language sql set search_path='' as
$$ select apois_rpc_private.admin_get_finance_summary($1,$2); $$;

-- O schema privado nao e exposto pelo PostgREST; authenticated recebe somente
-- o minimo necessario para os wrappers chamarem as implementacoes.
grant execute on function apois_rpc_private.admin_set_driver_suspension(uuid,boolean,text) to authenticated;
grant execute on function apois_rpc_private.admin_set_passenger_status(uuid,text,text) to authenticated;
grant execute on function apois_rpc_private.admin_update_ride_category(uuid,text,text,text,text,text,text,integer,boolean) to authenticated;
grant execute on function apois_rpc_private.admin_upsert_tariff_rule(text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,boolean) to authenticated;
grant execute on function apois_rpc_private.admin_set_staff_profile(uuid,public.app_role,boolean,text) to authenticated;
grant execute on function apois_rpc_private.admin_provision_staff(uuid,public.app_role,text) to authenticated;
grant execute on function apois_rpc_private.admin_update_sos_alert(uuid,text) to authenticated;
grant execute on function apois_rpc_private.admin_update_support_ticket(uuid,text,text) to authenticated;
grant execute on function apois_rpc_private.admin_get_dashboard_metrics() to authenticated;
grant execute on function apois_rpc_private.admin_get_finance_summary(timestamptz,timestamptz) to authenticated;

revoke all on function public.admin_set_driver_suspension(uuid,boolean,text) from public,anon;
revoke all on function public.admin_set_passenger_status(uuid,text,text) from public,anon;
revoke all on function public.admin_update_ride_category(uuid,text,text,text,text,text,text,integer,boolean) from public,anon;
revoke all on function public.admin_upsert_tariff_rule(text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,boolean) from public,anon;
revoke all on function public.admin_set_staff_profile(uuid,public.app_role,boolean,text) from public,anon;
revoke all on function public.admin_provision_staff(uuid,public.app_role,text) from public,anon;
revoke all on function public.admin_update_sos_alert(uuid,text) from public,anon;
revoke all on function public.admin_update_support_ticket(uuid,text,text) from public,anon;
revoke all on function public.admin_get_dashboard_metrics() from public,anon;
revoke all on function public.admin_get_finance_summary(timestamptz,timestamptz) from public,anon;

grant execute on function public.admin_set_driver_suspension(uuid,boolean,text) to authenticated;
grant execute on function public.admin_set_passenger_status(uuid,text,text) to authenticated;
grant execute on function public.admin_update_ride_category(uuid,text,text,text,text,text,text,integer,boolean) to authenticated;
grant execute on function public.admin_upsert_tariff_rule(text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,boolean) to authenticated;
grant execute on function public.admin_set_staff_profile(uuid,public.app_role,boolean,text) to authenticated;
grant execute on function public.admin_provision_staff(uuid,public.app_role,text) to authenticated;
grant execute on function public.admin_update_sos_alert(uuid,text) to authenticated;
grant execute on function public.admin_update_support_ticket(uuid,text,text) to authenticated;
grant execute on function public.admin_get_dashboard_metrics() to authenticated;
grant execute on function public.admin_get_finance_summary(timestamptz,timestamptz) to authenticated;
