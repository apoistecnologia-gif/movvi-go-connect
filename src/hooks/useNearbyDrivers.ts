import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type NearbyDriver = {
  user_id: string;
  name: string;
  category: Database["public"]["Enums"]["ride_category"];
  current_lat: number;
  current_lng: number;
  vehicle_model: string;
  vehicle_color: string;
  rating: number;
};

type Filter = {
  category?: Database["public"]["Enums"]["ride_category"];
};

/**
 * Lista motoristas aprovados + online com GPS, atualizando em tempo real
 * via Supabase Realtime. Aplica filtro por categoria quando informado.
 */
export function useNearbyDrivers({ category }: Filter = {}) {
  const [drivers, setDrivers] = useState<NearbyDriver[]>([]);

  useEffect(() => {
    let active = true;

    async function load() {
      let q = supabase
        .from("drivers")
        .select(
          "user_id, name, category, current_lat, current_lng, vehicle_model, vehicle_color, rating",
        )
        .eq("is_online", true)
        .eq("approval_status", "aprovado")
        .not("current_lat", "is", null)
        .not("current_lng", "is", null);
      if (category) q = q.eq("category", category);
      const { data } = await q;
      if (!active) return;
      setDrivers((data ?? []) as NearbyDriver[]);
    }
    load();

    const channel = supabase
      .channel("nearby-drivers")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "drivers" },
        () => load(),
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [category]);

  return drivers;
}
