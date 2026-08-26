import { useEffect, useState } from "react";
import {
  DISABLED_RIDE_FEATURE_FLAGS,
  fetchRideFeatureFlags,
  type RideFeatureFlags,
} from "@/lib/rideFeatureFlags";

export function useRideFeatureFlags(): RideFeatureFlags {
  const [flags, setFlags] = useState<RideFeatureFlags>(DISABLED_RIDE_FEATURE_FLAGS);

  useEffect(() => {
    let alive = true;
    void fetchRideFeatureFlags().then((next) => {
      if (alive) setFlags(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  return flags;
}
