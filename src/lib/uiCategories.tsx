import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Bike, Box, Car, Send, Truck, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRideFeatureFlags } from "@/hooks/useRideFeatureFlags";
import { isRideCategoryEnabled } from "@/lib/rideFeatureFlags";

export type RideCategoryCode = "carros" | "motos" | "fretes" | "guincho" | "envios";

export type UiCategory = {
  /** chave visual estável do cliente; não é a chave primária do banco. */
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  backend: RideCategoryCode;
  tagline: string;
  enabled: boolean;
};

/**
 * Catálogo visual de fallback. O contrato de negócio continua sendo o código
 * canônico de `ride_categories.code`; cor não é persistida como regra de banco.
 */
export const UI_CATEGORY_DEFAULTS: UiCategory[] = [
  { key: "carro", label: "Carro", icon: Car, color: "#8DD92B", backend: "carros", tagline: "Viagens urbanas com conforto", enabled: true },
  { key: "moto", label: "Moto", icon: Bike, color: "#5FAF1A", backend: "motos", tagline: "Viagens rápidas e econômicas", enabled: true },
  { key: "entrega", label: "Entrega", icon: Send, color: "#8DD92B", backend: "envios", tagline: "Envio de objetos e pequenos volumes", enabled: true },
  { key: "guincho", label: "Guincho", icon: Truck, color: "#5FAF1A", backend: "guincho", tagline: "Remoção e transporte de veículos", enabled: true },
  { key: "mudanca", label: "Mudança", icon: Box, color: "#8DD92B", backend: "fretes", tagline: "Transporte de móveis e cargas maiores", enabled: true },
];

export const ICON_REGISTRY: Record<string, LucideIcon> = { Car, Bike, Truck, Send, Box };

export function resolveIcon(name: string | null | undefined, fallback: LucideIcon): LucideIcon {
  if (!name) return fallback;
  return ICON_REGISTRY[name] ?? fallback;
}

type RideCategoryRow = {
  code: RideCategoryCode;
  name: string;
  icon: string | null;
  is_active: boolean;
  sort_order: number;
};

const UiCategoriesContext = createContext<UiCategory[]>(
  UI_CATEGORY_DEFAULTS.filter((category) => category.backend !== "guincho" && category.backend !== "fretes"),
);

/** Fonte de verdade visual do app: `public.ride_categories` canônico em realtime. */
export function UiCategoriesProvider({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState<RideCategoryRow[] | null>(null);
  const flags = useRideFeatureFlags();

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const { data, error } = await supabase
        .from("ride_categories")
        .select("code,name,icon,is_active,sort_order")
        .order("sort_order", { ascending: true });
      if (!alive) return;
      if (error) {
        if (import.meta.env.DEV) console.warn("[APOIS] ride_categories load:", error.message);
        setRows([]);
        return;
      }
      setRows((data ?? []) as RideCategoryRow[]);
    };
    void refresh();
    const channel = supabase
      .channel("apois-ride-categories-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "ride_categories" }, () => void refresh())
      .subscribe();
    return () => {
      alive = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  const merged = useMemo<UiCategory[]>(() => {
    if (!rows) return UI_CATEGORY_DEFAULTS.filter((category) => isRideCategoryEnabled(category.backend, flags));
    const byCode = new Map(rows.map((row) => [row.code, row]));
    const output: UiCategory[] = [];

    for (const fallback of UI_CATEGORY_DEFAULTS) {
      if (!isRideCategoryEnabled(fallback.backend, flags)) continue;
      const row = byCode.get(fallback.backend);
      if (!row) {
        output.push(fallback);
        continue;
      }
      if (!row.is_active) continue;
      output.push({
        ...fallback,
        label: row.name || fallback.label,
        icon: resolveIcon(row.icon, fallback.icon),
        enabled: true,
      });
    }

    output.sort((a, b) => {
      const aOrder = byCode.get(a.backend)?.sort_order ?? 999;
      const bOrder = byCode.get(b.backend)?.sort_order ?? 999;
      return aOrder - bOrder;
    });
    return output;
  }, [flags, rows]);

  return <UiCategoriesContext.Provider value={merged}>{children}</UiCategoriesContext.Provider>;
}

export function useUiCategories(): UiCategory[] {
  return useContext(UiCategoriesContext);
}
