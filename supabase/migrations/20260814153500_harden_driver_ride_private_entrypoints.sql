-- Keep the public RPC surface as the only authenticated entrypoint for the
-- driver lifecycle/presence functions. The private implementations continue
-- to enforce auth/ownership, but must not be directly callable by clients.

create or replace function public.driver_mark_arrived(_ride_id uuid)
returns jsonb
language sql
security definer
set search_path to ''
as $function$
  select apois_rpc_private.driver_mark_arrived($1);
$function$;

create or replace function public.driver_start_ride(_ride_id uuid, _security_code text)
returns jsonb
language sql
security definer
set search_path to ''
as $function$
  select apois_rpc_private.driver_start_ride($1, $2);
$function$;

create or replace function public.driver_finish_ride(_ride_id uuid)
returns jsonb
language sql
security definer
set search_path to ''
as $function$
  select apois_rpc_private.driver_finish_ride($1);
$function$;

create or replace function public.driver_set_presence(
  _online boolean,
  _lat numeric default null,
  _lng numeric default null,
  _heading numeric default null,
  _speed numeric default null
)
returns jsonb
language sql
security definer
set search_path to ''
as $function$
  select apois_rpc_private.driver_set_presence($1, $2, $3, $4, $5);
$function$;

revoke execute on function apois_rpc_private.driver_mark_arrived(uuid) from public, anon, authenticated;
revoke execute on function apois_rpc_private.driver_start_ride(uuid, text) from public, anon, authenticated;
revoke execute on function apois_rpc_private.driver_finish_ride(uuid) from public, anon, authenticated;
revoke execute on function apois_rpc_private.driver_set_presence(boolean, numeric, numeric, numeric, numeric) from public, anon, authenticated;

grant execute on function apois_rpc_private.driver_mark_arrived(uuid) to service_role;
grant execute on function apois_rpc_private.driver_start_ride(uuid, text) to service_role;
grant execute on function apois_rpc_private.driver_finish_ride(uuid) to service_role;
grant execute on function apois_rpc_private.driver_set_presence(boolean, numeric, numeric, numeric, numeric) to service_role;

revoke execute on function public.driver_mark_arrived(uuid) from public, anon;
revoke execute on function public.driver_start_ride(uuid, text) from public, anon;
revoke execute on function public.driver_finish_ride(uuid) from public, anon;
revoke execute on function public.driver_set_presence(boolean, numeric, numeric, numeric, numeric) from public, anon;

grant execute on function public.driver_mark_arrived(uuid) to authenticated, service_role;
grant execute on function public.driver_start_ride(uuid, text) to authenticated, service_role;
grant execute on function public.driver_finish_ride(uuid) to authenticated, service_role;
grant execute on function public.driver_set_presence(boolean, numeric, numeric, numeric, numeric) to authenticated, service_role;
