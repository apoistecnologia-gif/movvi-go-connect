-- APOIS Corridas: current onboarding is driver_complete_registration_v3.
-- The old bootstrap RPC creates a partial pending driver without the current
-- address/income/5-document contract and has no caller in the current app.
-- Keep it service-role-only for rollback/administrative compatibility.

revoke execute on function public.driver_bootstrap_profile(text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.driver_bootstrap_profile(text,text,text,text)
  to service_role;

revoke execute on function apois_rpc_private.driver_bootstrap_profile(text,text,text,text)
  from public,anon,authenticated;
grant execute on function apois_rpc_private.driver_bootstrap_profile(text,text,text,text)
  to service_role;
