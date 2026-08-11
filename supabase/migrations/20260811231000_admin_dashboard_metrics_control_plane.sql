BEGIN;

DROP POLICY IF EXISTS passenger_support_tickets_admin_read ON public.passenger_support_tickets;
CREATE POLICY passenger_support_tickets_admin_read
ON public.passenger_support_tickets
FOR SELECT
TO authenticated
USING (private.has_permission('users.manage'));

CREATE OR REPLACE FUNCTION public.admin_get_dashboard_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_day_start timestamptz := (date_trunc('day', now() AT TIME ZONE 'America/Recife') AT TIME ZONE 'America/Recife');
  v_month_start timestamptz := (date_trunc('month', now() AT TIME ZONE 'America/Recife') AT TIME ZONE 'America/Recife');
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF NOT private.has_permission('users.manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'drivers', jsonb_build_object(
      'total', (SELECT count(*) FROM public.drivers),
      'online', (SELECT count(*) FROM public.drivers WHERE is_online IS TRUE),
      'pending_review', (
        SELECT count(*) FROM public.drivers
        WHERE coalesce(approval_status, '') IN ('em_analise','pendente','pending','pending_review')
           OR coalesce(documents_status, '') IN ('pending','pending_review','em_analise')
      )
    ),
    'passengers', jsonb_build_object(
      'total', (
        SELECT count(DISTINCT ur.user_id)
        FROM public.user_roles ur
        JOIN public.users u ON u.id = ur.user_id
        WHERE ur.role::text = 'passenger'
          AND u.deleted_at IS NULL
      )
    ),
    'rides', jsonb_build_object(
      'active', (
        SELECT count(*) FROM public.rides
        WHERE status IN ('procurar_motorista','motorista_a_caminho','motorista_chegou','em_viagem')
      ),
      'completed_today', (
        SELECT count(*) FROM public.rides
        WHERE status = 'finalizada'
          AND completed_at >= v_day_start
          AND completed_at < v_day_start + interval '1 day'
      ),
      'cancelled_today', (
        SELECT count(*) FROM public.rides
        WHERE status IN ('cancelada_passageiro','cancelada_motorista')
          AND cancelled_at >= v_day_start
          AND cancelled_at < v_day_start + interval '1 day'
      )
    ),
    'operations', jsonb_build_object(
      'open_sos', (
        SELECT count(*) FROM public.sos_alerts
        WHERE status IN ('open','acknowledged')
      ),
      'open_support', (
        SELECT count(*) FROM public.passenger_support_tickets
        WHERE lower(coalesce(status,'')) NOT IN ('resolved','closed','cancelled','cancelado','resolvido','fechado')
      )
    ),
    'finance', jsonb_build_object(
      'today', jsonb_build_object(
        'gmv_cents', (
          SELECT coalesce(round(sum(coalesce(passenger_charge, gross_amount)) * 100), 0)::bigint
          FROM public.ride_settlements
          WHERE status = 'settled' AND settled_at >= v_day_start AND settled_at < v_day_start + interval '1 day'
        ),
        'driver_earnings_cents', (
          SELECT coalesce(round(sum(coalesce(driver_earning, 0)) * 100), 0)::bigint
          FROM public.ride_settlements
          WHERE status = 'settled' AND settled_at >= v_day_start AND settled_at < v_day_start + interval '1 day'
        ),
        'platform_revenue_cents', (
          SELECT coalesce(round(sum(coalesce(platform_fee, 0)) * 100), 0)::bigint
          FROM public.ride_settlements
          WHERE status = 'settled' AND settled_at >= v_day_start AND settled_at < v_day_start + interval '1 day'
        ),
        'provider_fees_cents', (
          SELECT coalesce(round(sum(coalesce(payment_provider_fee, 0)) * 100), 0)::bigint
          FROM public.ride_settlements
          WHERE status = 'settled' AND settled_at >= v_day_start AND settled_at < v_day_start + interval '1 day'
        )
      ),
      'month', jsonb_build_object(
        'gmv_cents', (
          SELECT coalesce(round(sum(coalesce(passenger_charge, gross_amount)) * 100), 0)::bigint
          FROM public.ride_settlements
          WHERE status = 'settled' AND settled_at >= v_month_start AND settled_at < v_month_start + interval '1 month'
        ),
        'driver_earnings_cents', (
          SELECT coalesce(round(sum(coalesce(driver_earning, 0)) * 100), 0)::bigint
          FROM public.ride_settlements
          WHERE status = 'settled' AND settled_at >= v_month_start AND settled_at < v_month_start + interval '1 month'
        ),
        'platform_revenue_cents', (
          SELECT coalesce(round(sum(coalesce(platform_fee, 0)) * 100), 0)::bigint
          FROM public.ride_settlements
          WHERE status = 'settled' AND settled_at >= v_month_start AND settled_at < v_month_start + interval '1 month'
        ),
        'provider_fees_cents', (
          SELECT coalesce(round(sum(coalesce(payment_provider_fee, 0)) * 100), 0)::bigint
          FROM public.ride_settlements
          WHERE status = 'settled' AND settled_at >= v_month_start AND settled_at < v_month_start + interval '1 month'
        )
      )
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_dashboard_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_metrics() TO authenticated, service_role;

COMMIT;
