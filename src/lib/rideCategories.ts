import { Bike, Car, Send, Truck, Box } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

export type RideCategory = Database["public"]["Enums"]["ride_category"];

/**
 * Tarifa de uma categoria: base + (R$/km * km) + (R$/min * min), com mínimo.
 * Os valores REAIS vêm de `admin_settings` (chaves `tariff_<categoria>`).
 *
 * Os valores abaixo são FALLBACK DE DESENVOLVIMENTO e só são usados quando
 * o app ainda não conseguiu carregar a configuração do banco. Não devem ser
 * referenciados como tabela oficial — o painel admin é a fonte da verdade.
 */
export type Tariff = {
  base: number;
  perKm: number;
  perMin: number;
  min: number;
};

export type TariffMap = Partial<Record<RideCategory, Tariff>>;

/** ⚠️ DEV FALLBACK — substituído pela configuração do admin em runtime. */
export const DEV_FALLBACK_TARIFFS: Record<RideCategory, Tariff> = {
  carros:  { base: 6,   perKm: 2.4, perMin: 0.35, min: 8  },
  motos:   { base: 3.5, perKm: 1.4, perMin: 0.2,  min: 5  },
  fretes:  { base: 12,  perKm: 3.2, perMin: 0.5,  min: 18 },
  guincho: { base: 80,  perKm: 5.5, perMin: 0.6,  min: 90 },
  envios:  { base: 8,   perKm: 2.0, perMin: 0.25, min: 10 },
};

/** Metadados visuais — não inclui tarifas (essas vêm de `TariffMap`). */
export const RIDE_CATEGORIES: {
  key: RideCategory;
  label: string;
  icon: typeof Car;
  emoji: string;
}[] = [
  { key: "carros",  label: "Carros",  icon: Car,  emoji: "🚗" },
  { key: "motos",   label: "Motos",   icon: Bike, emoji: "🏍️" },
  { key: "fretes",  label: "Fretes",  icon: Box,  emoji: "📦" },
  { key: "guincho", label: "Guincho", icon: Truck, emoji: "🚛" },
  { key: "envios",  label: "Envios",  icon: Send, emoji: "📮" },
];

export function getTariff(cat: RideCategory, tariffs?: TariffMap): Tariff {
  return tariffs?.[cat] ?? DEV_FALLBACK_TARIFFS[cat];
}

export function estimateFare(
  cat: RideCategory,
  km: number,
  min: number,
  tariffs?: TariffMap,
): number {
  const t = getTariff(cat, tariffs);
  const total = t.base + t.perKm * km + t.perMin * min;
  return Math.max(t.min, Math.round(total * 100) / 100);
}

export function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
