-- APOIS Corridas: passenger receipt is a server-owned, least-data projection.
-- Never return to_jsonb(rides) because that exposes internal dispatch/security
-- fields (PIN state, share token, provider IDs, candidate lists, etc.).

CREATE OR REPLACE FUNCTION apois_rpc_private.get_passenger_ride_receipt(_ride_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'apois_rpc_private'
AS $function$
DECLARE
  v_passenger_id uuid;
  v_ride public.rides%rowtype;
  v_settlement public.ride_settlements%rowtype;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '42501';
  END IF;

  v_passenger_id := public.mobility_user_id();
  IF v_passenger_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '42501';
  END IF;

  SELECT * INTO v_ride
  FROM public.rides
  WHERE id = _ride_id
    AND passenger_id = v_passenger_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ride_not_found' USING errcode = 'P0002';
  END IF;

  IF v_ride.status = 'finalizada' THEN
    SELECT * INTO v_settlement
    FROM public.ride_settlements
    WHERE ride_id = v_ride.id;

    IF NOT FOUND THEN
      v_settlement := public.ensure_ride_settlement(v_ride.id);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'source', 'server',
    'ride', jsonb_build_object(
      'id', v_ride.id,
      'passenger_id', v_ride.passenger_id,
      'status', v_ride.status,
      'category', v_ride.category,
      'origin', v_ride.origin,
      'destination', v_ride.destination,
      'intermediates', coalesce(v_ride.intermediates, '[]'::jsonb),
      'origin_name', v_ride.origin_name,
      'destination_name', v_ride.destination_name,
      'origin_lat', v_ride.origin_lat,
      'origin_lng', v_ride.origin_lng,
      'destination_lat', v_ride.destination_lat,
      'destination_lng', v_ride.destination_lng,
      'estimated_price', v_ride.estimated_price,
      'final_price', v_ride.final_price,
      'distance_km', v_ride.distance_km,
      'duration_min', v_ride.duration_min,
      'payment_method', v_ride.payment_method,
      'driver_name', v_ride.driver_name,
      'driver_rating', v_ride.driver_rating,
      'driver_vehicle_model', v_ride.driver_vehicle_model,
      'driver_vehicle_color', v_ride.driver_vehicle_color,
      'driver_vehicle_plate', v_ride.driver_vehicle_plate,
      'cancellation_reason', v_ride.cancellation_reason,
      'cancellation_fee', v_ride.cancellation_fee,
      'passenger_rating', v_ride.passenger_rating,
      'created_at', v_ride.created_at,
      'accepted_at', v_ride.accepted_at,
      'started_at', v_ride.started_at,
      'completed_at', v_ride.completed_at,
      'cancelled_at', v_ride.cancelled_at,
      'updated_at', v_ride.updated_at
    ),
    'settlement', CASE
      WHEN v_settlement.ride_id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'ride_id', v_settlement.ride_id,
        'currency', v_settlement.currency,
        'gross_amount', v_settlement.gross_amount,
        'discount_amount', v_settlement.discount_amount,
        'passenger_charge', v_settlement.passenger_charge,
        'platform_fee', v_settlement.platform_fee,
        'driver_earning', v_settlement.driver_earning,
        'payment_provider_fee', v_settlement.payment_provider_fee,
        'cash_amount', v_settlement.cash_amount,
        'wallet_amount', v_settlement.wallet_amount,
        'refunded_amount', v_settlement.refunded_amount,
        'payment_method', v_settlement.payment_method,
        'payment_provider', v_settlement.payment_provider,
        'payment_status', v_settlement.payment_status,
        'status', v_settlement.status,
        'settled_at', v_settlement.settled_at,
        'created_at', v_settlement.created_at,
        'updated_at', v_settlement.updated_at
      )
    END
  );
END;
$function$;

ALTER FUNCTION public.get_passenger_ride_receipt(uuid) SECURITY DEFINER;

REVOKE ALL ON FUNCTION apois_rpc_private.get_passenger_ride_receipt(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION apois_rpc_private.get_passenger_ride_receipt(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_passenger_ride_receipt(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_passenger_ride_receipt(uuid) TO authenticated, service_role;
