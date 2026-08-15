-- Keep the public payout-destination RPC executable by authenticated drivers
-- while the privileged implementation remains private to postgres.
--
-- The wrapper must be SECURITY DEFINER; otherwise an authenticated caller
-- reaches apois_rpc_private as its own role and is denied before the private
-- function can perform its auth/driver ownership checks.

create or replace function public.driver_set_payout_destination(
  _pix_key text,
  _pix_key_type text,
  _holder_name text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select apois_rpc_private.driver_set_payout_destination($1, $2, $3);
$function$;

revoke all on function public.driver_set_payout_destination(text, text, text) from public;
revoke all on function public.driver_set_payout_destination(text, text, text) from anon;
grant execute on function public.driver_set_payout_destination(text, text, text) to authenticated;
grant execute on function public.driver_set_payout_destination(text, text, text) to service_role;
