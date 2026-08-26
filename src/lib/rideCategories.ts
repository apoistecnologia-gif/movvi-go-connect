import { Bike, Car, Send, Truck, Box } from "lucide-react";

export type RideCategory = "carros" | "motos" | "fretes" | "guincho" | "envios";

export type Tariff = {
  base: number;
  perKm: number;
  perMin: number;
  min: number;
};

export type TariffMap = Partial<Record<RideCategory, Tariff>>;

/** ⚠️ Fallback visual/local. A tarifa autoritativa da corrida é calculada no backend. */
export const DEV_FALLBACK_TARIFFS: Record<RideCategory, Tariff> = {
  carros: { base: 6, perKm: 2.4, perMin: 0.35, min: 8 },
  motos: { base: 3.5, perKm: 1.4, perMin: 0.2, min: 5 },
  fretes: { base: 12, perKm: 3.2, perMin: 0.5, min: 18 },
  guincho: { base: 80, perKm: 5.5, perMin: 0.6, min: 90 },
  envios: { base: 8, perKm: 2.0, perMin: 0.25, min: 10 },
};

export const RIDE_CATEGORIES: {
  key: RideCategory;
  label: string;
  icon: typeof Car;
  emoji: string;
}[] = [
  { key: "carros", label: "Carros", icon: Car, emoji: "🚗" },
  { key: "motos", label: "Motos", icon: Bike, emoji: "🏍️" },
  { key: "fretes", label: "Fretes", icon: Box, emoji: "📦" },
  { key: "guincho", label: "Guincho", icon: Truck, emoji: "🚛" },
  { key: "envios", label: "Envios", icon: Send, emoji: "📮" },
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
