-- Route authenticated clients exclusively through public RPC wrappers.
-- Public wrappers become SECURITY DEFINER so they can invoke the private
-- implementation after authenticated loses EXECUTE on apois_rpc_private.*.

alter function public.deactivate_notification_token(text) security definer;
alter function public.driver_accept_ride(uuid) security definer;
alter function public.driver_bootstrap_profile(text,text,text,text) security definer;
alter function public.driver_complete_registration(text,text,text,date,text,text,text,text,text,text,integer,text,text,text,text,text) security definer;
alter function public.driver_complete_registration_v2(text,text,text,date,text,text,text,text,text,text,integer,text,text,text,text,text,text) security definer;
alter function public.driver_complete_registration_v3(text,text,text,date,text,text,text,text,text,text,text,numeric,text,text,text,text,integer,text,text,text,text,text,text) security definer;
alter function public.driver_get_profile() security definer;
alter function public.driver_reject_ride(uuid) security definer;
alter function public.driver_request_withdrawal(bigint,uuid) security definer;
alter function public.get_driver_financial_dashboard(timestamptz,timestamptz) security definer;
alter function public.get_driver_ride_settlement(uuid) security definer;
alter function public.get_passenger_ride_security_code(uuid) security definer;
alter function public.get_ride_cancellation_policy() security definer;
alter function public.register_notification_token(text,text,text,text) security definer;

revoke execute on function apois_rpc_private.deactivate_notification_token(text) from public, anon, authenticated;
revoke execute on function apois_rpc_private.driver_accept_ride(uuid) from public, anon, authenticated;
revoke execute on function apois_rpc_private.driver_bootstrap_profile(text,text,text,text) from public, anon, authenticated;
revoke execute on function apois_rpc_private.driver_complete_registration(text,text,text,date,text,text,text,text,text,text,integer,text,text,text,text,text) from public, anon, authenticated;
revoke execute on function apois_rpc_private.driver_complete_registration_v2(text,text,text,date,text,text,text,text,text,text,integer,text,text,text,text,text,text) from public, anon, authenticated;
revoke execute on function apois_rpc_private.driver_complete_registration_v3(text,text,text,date,text,text,text,text,text,text,text,numeric,text,text,text,text,integer,text,text,text,text,text,text) from public, anon, authenticated;
revoke execute on function apois_rpc_private.driver_get_profile() from public, anon, authenticated;
revoke execute on function apois_rpc_private.driver_reject_ride(uuid) from public, anon, authenticated;
revoke execute on function apois_rpc_private.driver_request_withdrawal(bigint,uuid) from public, anon, authenticated;
revoke execute on function apois_rpc_private.get_driver_financial_dashboard(timestamptz,timestamptz) from public, anon, authenticated;
revoke execute on function apois_rpc_private.get_driver_ride_settlement(uuid) from public, anon, authenticated;
revoke execute on function apois_rpc_private.get_passenger_ride_security_code(uuid) from public, anon, authenticated;
revoke execute on function apois_rpc_private.get_ride_cancellation_policy() from public, anon, authenticated;
revoke execute on function apois_rpc_private.register_notification_token(text,text,text,text) from public, anon, authenticated;

grant execute on function apois_rpc_private.deactivate_notification_token(text) to postgres, service_role;
grant execute on function apois_rpc_private.driver_accept_ride(uuid) to postgres, service_role;
grant execute on function apois_rpc_private.driver_bootstrap_profile(text,text,text,text) to postgres, service_role;
grant execute on function apois_rpc_private.driver_complete_registration(text,text,text,date,text,text,text,text,text,text,integer,text,text,text,text,text) to postgres, service_role;
grant execute on function apois_rpc_private.driver_complete_registration_v2(text,text,text,date,text,text,text,text,text,text,integer,text,text,text,text,text,text) to postgres, service_role;
grant execute on function apois_rpc_private.driver_complete_registration_v3(text,text,text,date,text,text,text,text,text,text,text,numeric,text,text,text,text,integer,text,text,text,text,text,text) to postgres, service_role;
grant execute on function apois_rpc_private.driver_get_profile() to postgres, service_role;
grant execute on function apois_rpc_private.driver_reject_ride(uuid) to postgres, service_role;
grant execute on function apois_rpc_private.driver_request_withdrawal(bigint,uuid) to postgres, service_role;
grant execute on function apois_rpc_private.get_driver_financial_dashboard(timestamptz,timestamptz) to postgres, service_role;
grant execute on function apois_rpc_private.get_driver_ride_settlement(uuid) to postgres, service_role;
grant execute on function apois_rpc_private.get_passenger_ride_security_code(uuid) to postgres, service_role;
grant execute on function apois_rpc_private.get_ride_cancellation_policy() to postgres, service_role;
grant execute on function apois_rpc_private.register_notification_token(text,text,text,text) to postgres, service_role;
