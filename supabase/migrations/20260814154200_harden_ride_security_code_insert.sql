-- The PIN capture trigger previously covered only UPDATE OF security_code.
-- Harden INSERT as well so no code path can persist a raw ride PIN in
-- public.rides before it is moved into ride_security_secrets.

drop trigger if exists trg_apois_capture_ride_security_code on public.rides;

create trigger trg_apois_capture_ride_security_code
before insert or update of security_code on public.rides
for each row
execute function public.apois_capture_ride_security_code();
