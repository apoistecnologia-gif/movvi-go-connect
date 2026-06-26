import { Bike, Car, Package, Send, Truck } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

export type RideCategory = Database["public"]["Enums"]["ride_category"];

/** Tarifa estimada simples: base + (R$/km * km). */
export const RIDE_CATEGORIES: {
  key: RideCategory;
  label: string;
  icon: typeof Car;
  base: number;
  perKm: number;
  perMin: number;
  emoji: string;
}[] = [
  { key: "carros",  label: "Carros",  icon: Car,     base: 6,   perKm: 2.4, perMin: 0.35, emoji: "🚗" },
  { key: "motos",   label: "Motos",   icon: Bike,    base: 3.5, perKm: 1.4, perMin: 0.2,  emoji: "🏍️" },
  { key: "fretes",  label: "Fretes",  icon: Package, base: 12,  perKm: 3.2, perMin: 0.5,  emoji: "📦" },
  { key: "guincho", label: "Guincho", icon: Truck,   base: 80,  perKm: 5.5, perMin: 0.6,  emoji: "🚛" },
  { key: "envios",  label: "Envios",  icon: Send,    base: 8,   perKm: 2.0, perMin: 0.25, emoji: "📮" },
];

export function estimateFare(cat: RideCategory, km: number, min: number) {
  const c = RIDE_CATEGORIES.find((x) => x.key === cat)!;
  const total = c.base + c.perKm * km + c.perMin * min;
  return Math.max(c.base, Math.round(total * 100) / 100);
}

export function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
