-- Prevent authenticated clients, including staff sessions, from bypassing the
-- canonical audited RPC control plane with direct table mutations.
-- Read access remains governed by existing RLS policies.

revoke insert, update, delete on table public.drivers from anon, authenticated;
revoke insert, update, delete on table public.profiles from anon, authenticated;
revoke insert, update, delete on table public.ride_categories from anon, authenticated;
revoke insert, update, delete on table public.tariff_rules from anon, authenticated;

-- Canonical write paths run through SECURITY DEFINER RPCs owned by postgres.
grant all privileges on table public.drivers to postgres, service_role;
grant all privileges on table public.profiles to postgres, service_role;
grant all privileges on table public.ride_categories to postgres, service_role;
grant all privileges on table public.tariff_rules to postgres, service_role;
