-- Force authenticated clients through the public admin RPC surface.
-- Public wrappers execute as postgres and preserve the existing permission checks
-- inside apois_rpc_private.* while preventing direct calls to the private schema.

alter function public.admin_get_dashboard_metrics() security definer;
alter function public.admin_get_finance_summary(timestamptz,timestamptz) security definer;
alter function public.admin_is_authorized() security definer;
alter function public.admin_provision_staff(uuid,public.app_role,text) security definer;
alter function public.admin_set_driver_suspension(uuid,boolean,text) security definer;
alter function public.admin_set_passenger_status(uuid,text,text) security definer;
alter function public.admin_set_staff_profile(uuid,public.app_role,boolean,text) security definer;
alter function public.admin_update_ride_category(uuid,text,text,text,text,text,text,integer,boolean) security definer;
alter function public.admin_update_sos_alert(uuid,text) security definer;
alter function public.admin_update_support_ticket(uuid,text,text) security definer;
alter function public.admin_upsert_tariff_rule(text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,boolean) security definer;

revoke execute on function apois_rpc_private.admin_get_dashboard_metrics() from public, anon, authenticated;
revoke execute on function apois_rpc_private.admin_get_finance_summary(timestamptz,timestamptz) from public, anon, authenticated;
revoke execute on function apois_rpc_private.admin_is_authorized() from public, anon, authenticated;
revoke execute on function apois_rpc_private.admin_provision_staff(uuid,public.app_role,text) from public, anon, authenticated;
revoke execute on function apois_rpc_private.admin_set_driver_suspension(uuid,boolean,text) from public, anon, authenticated;
revoke execute on function apois_rpc_private.admin_set_passenger_status(uuid,text,text) from public, anon, authenticated;
revoke execute on function apois_rpc_private.admin_set_staff_profile(uuid,public.app_role,boolean,text) from public, anon, authenticated;
revoke execute on function apois_rpc_private.admin_update_ride_category(uuid,text,text,text,text,text,text,integer,boolean) from public, anon, authenticated;
revoke execute on function apois_rpc_private.admin_update_sos_alert(uuid,text) from public, anon, authenticated;
revoke execute on function apois_rpc_private.admin_update_support_ticket(uuid,text,text) from public, anon, authenticated;
revoke execute on function apois_rpc_private.admin_upsert_tariff_rule(text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,boolean) from public, anon, authenticated;

grant execute on function apois_rpc_private.admin_get_dashboard_metrics() to postgres, service_role;
grant execute on function apois_rpc_private.admin_get_finance_summary(timestamptz,timestamptz) to postgres, service_role;
grant execute on function apois_rpc_private.admin_is_authorized() to postgres, service_role;
grant execute on function apois_rpc_private.admin_provision_staff(uuid,public.app_role,text) to postgres, service_role;
grant execute on function apois_rpc_private.admin_set_driver_suspension(uuid,boolean,text) to postgres, service_role;
grant execute on function apois_rpc_private.admin_set_passenger_status(uuid,text,text) to postgres, service_role;
grant execute on function apois_rpc_private.admin_set_staff_profile(uuid,public.app_role,boolean,text) to postgres, service_role;
grant execute on function apois_rpc_private.admin_update_ride_category(uuid,text,text,text,text,text,text,integer,boolean) to postgres, service_role;
grant execute on function apois_rpc_private.admin_update_sos_alert(uuid,text) to postgres, service_role;
grant execute on function apois_rpc_private.admin_update_support_ticket(uuid,text,text) to postgres, service_role;
grant execute on function apois_rpc_private.admin_upsert_tariff_rule(text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,boolean) to postgres, service_role;
