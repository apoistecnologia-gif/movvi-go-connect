import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Bike, Box, Car, Send, Truck, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type RideCategoryEnum = Database["public"]["Enums"]["ride_category"];

export type UiCategory = {
  /** chave de UI (estável, independente do enum backend). */
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  backend: RideCategoryEnum;
  tagline: string;
  enabled: boolean;
};

/** Catálogo padrão APOIS (fallback). O admin pode renomear / desabilitar / recolorir cada uma. */
export const UI_CATEGORY_DEFAULTS: UiCategory[] = [
  { key: "carro",   label: "Carro",   icon: Car,   color: "#8DD92B", backend: "carros",  tagline: "Viagens urbanas com conforto",           enabled: true },
  { key: "moto",    label: "Moto",    icon: Bike,  color: "#5FAF1A", backend: "motos",   tagline: "Viagens rápidas e econômicas",           enabled: true },
  { key: "entrega", label: "Entrega", icon: Send,  color: "#8DD92B", backend: "envios",  tagline: "Envio de objetos e pequenos volumes",    enabled: true },
  { key: "guincho", label: "Guincho", icon: Truck, color: "#5FAF1A", backend: "guincho", tagline: "Remoção e transporte de veículos",       enabled: true },
  { key: "mudanca", label: "Mudança", icon: Box,   color: "#8DD92B", backend: "fretes",  tagline: "Transporte de móveis e cargas maiores",  enabled: true },
];

/** Ícones suportados no admin para escolha visual. */
export const ICON_REGISTRY: Record<string, LucideIcon> = {
  Car, Bike, Truck, Send, Box,
};

export function resolveIcon(name: string | null | undefined, fallback: LucideIcon): LucideIcon {
  if (!name) return fallback;
  return ICON_REGISTRY[name] ?? fallback;
}

type RideCategoryRow = {
  key: string;
  label: string;
  icon: string;
  color: string;
  enabled: boolean;
  sort_order: number;
};

const UiCategoriesContext = createContext<UiCategory[]>(UI_CATEGORY_DEFAULTS);

/** Fonte da verdade do app do passageiro. Lê `ride_categories` em realtime. */
export function UiCategoriesProvider({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState<RideCategoryRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const { data, error } = await supabase
        .from("ride_categories")
        .select("key,label,icon,color,enabled,sort_order")
        .order("sort_order", { ascending: true });
      if (!alive) return;
      if (error) {
        if (import.meta.env.DEV) console.warn("[APOIS] ride_categories load:", error.message);
        setRows([]);
        return;
      }
      setRows((data ?? []) as RideCategoryRow[]);
    };
    refresh();
    const channel = supabase
      .channel("movvi-ride-categories-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "ride_categories" }, refresh)
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const merged = useMemo<UiCategory[]>(() => {
    if (!rows) return UI_CATEGORY_DEFAULTS; // antes do primeiro fetch, evita "piscar vazio"
    // Cada UI default tem um `backend` (enum). Casamos pela chave de backend.
    const byBackend = new Map(rows.map((r) => [r.key, r]));
    const out: UiCategory[] = [];
    for (const def of UI_CATEGORY_DEFAULTS) {
      const row = byBackend.get(def.backend);
      if (!row) {
        out.push(def);
        continue;
      }
      if (!row.enabled) continue;
      out.push({
        ...def,
        label: row.label || def.label,
        color: row.color || def.color,
        icon: resolveIcon(row.icon, def.icon),
        enabled: true,
      });
    }
    // Respeita a ordem do banco quando possível.
    out.sort((a, b) => {
      const ra = byBackend.get(a.backend)?.sort_order ?? 999;
      const rb = byBackend.get(b.backend)?.sort_order ?? 999;
      return ra - rb;
    });
    return out;
  }, [rows]);

  return <UiCategoriesContext.Provider value={merged}>{children}</UiCategoriesContext.Provider>;
}

export function useUiCategories(): UiCategory[] {
  return useContext(UiCategoriesContext);
}
