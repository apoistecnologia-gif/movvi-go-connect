import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadTariffs } from "@/lib/tariffs";
import type { TariffMap } from "@/lib/rideCategories";

/**
 * Hook reativo: carrega tarifas do banco e re-carrega sempre que o admin
 * altera `tariff_rules` ou `ride_categories` (via Supabase Realtime).
 */
export function useTariffs(): { tariffs: TariffMap; loading: boolean } {
  const [tariffs, setTariffs] = useState<TariffMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const t = await loadTariffs();
        if (alive) setTariffs(t);
      } finally {
        if (alive) setLoading(false);
      }
    };
    refresh();

    const channel = supabase
      .channel("movvi-tariffs-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "tariff_rules" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "ride_categories" }, refresh)
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return { tariffs, loading };
}
