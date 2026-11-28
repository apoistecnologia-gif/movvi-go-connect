import { supabase } from "@/integrations/supabase/client";
import { HML_ORIGIN } from "./hml-mobile-transport";
import {
  DISABLED_RIDE_FEATURE_FLAGS,
  parseRideFeatureFlags,
  type RideFeatureFlags,
} from "@/lib/rideFeatureFlags.core";

export {
  DISABLED_RIDE_FEATURE_FLAGS,
  isRideCategoryEnabled,
  parseRideFeatureFlags,
  type RideFeatureFlags,
} from "@/lib/rideFeatureFlags.core";

type FeatureFlagRpcClient = {
  rpc: (
    name: "get_ride_feature_flags",
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export async function fetchRideFeatureFlags(): Promise<RideFeatureFlags> {
  if(import.meta.env.VITE_SUPABASE_URL===HML_ORIGIN)return {...DISABLED_RIDE_FEATURE_FLAGS};
  const { data, error } = await (supabase as unknown as FeatureFlagRpcClient).rpc(
    "get_ride_feature_flags",
  );
  if (error) {
    if (import.meta.env.DEV) {
      console.warn("[APOIS] ride feature flags unavailable; disabling gated operations", error.message);
    }
    return { ...DISABLED_RIDE_FEATURE_FLAGS };
  }
  return parseRideFeatureFlags(data);
}
