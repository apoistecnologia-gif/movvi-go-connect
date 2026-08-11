-- P0 least-privilege hardening.
-- These tables have RLS enabled and no anon/public policy granting useful access.
-- Remove the underlying anon table privileges so anonymous clients cannot gain access
-- merely because a future policy is added or altered incorrectly.

REVOKE ALL PRIVILEGES ON TABLE public.account_deletion_requests FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.admin_driver_notes FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.app_settings FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.cancellation_fees FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.driver_emergency_contacts FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.driver_wallet_transactions FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.driver_wallets FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.driver_withdrawals FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.drivers FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.notification_logs FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.notifications FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.passenger_emergency_contacts FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.passenger_support_tickets FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.passenger_wallets FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.payment_methods FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.ride_categories FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.rides FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.sos_alerts FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.tariff_rules FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.user_notification_preferences FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.user_roles FROM anon;

-- Deliberately public surfaces are not touched:
-- content_documents (published content SELECT), media_assets (published public media SELECT),
-- form_submissions (public INSERT).
