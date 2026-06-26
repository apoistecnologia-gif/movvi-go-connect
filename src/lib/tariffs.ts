import { supabase } from "@/integrations/supabase/client";
import {
  DEV_FALLBACK_TARIFFS,
  type RideCategory,
  type Tariff,
  type TariffMap,
} from "@/lib/rideCategories";

/**
 * Carrega as tarifas configuradas pelo painel admin (`admin_settings.tariff_*`).
 * Cada linha é um JSONB do tipo:
 *   { "base": 5, "per_km": 2.2, "per_min": 0.35, "min": 8, ... }
 *
 * Campos faltantes caem para o DEV_FALLBACK da categoria.
 */
export async function loadTariffs(): Promise<TariffMap> {
  const { data, error } = await supabase
    .from("admin_settings")
    .select("key,value")
    .like("key", "tariff_%");

  if (error) {
    console.warn("[MOVVI] Falha ao carregar tarifas, usando fallback dev:", error.message);
    return { ...DEV_FALLBACK_TARIFFS };
  }

  const out: TariffMap = {};
  for (const row of data ?? []) {
    const key = row.key.replace(/^tariff_/, "") as RideCategory;
    if (!(key in DEV_FALLBACK_TARIFFS)) continue;
    const v = (row.value ?? {}) as Record<string, unknown>;
    const num = (x: unknown, fb: number) =>
      typeof x === "number" && Number.isFinite(x) ? x : fb;
    const fb = DEV_FALLBACK_TARIFFS[key];
    const tariff: Tariff = {
      base: num(v.base, fb.base),
      perKm: num(v.per_km ?? v.perKm, fb.perKm),
      perMin: num(v.per_min ?? v.perMin, fb.perMin),
      min: num(v.min, fb.min),
    };
    out[key] = tariff;
  }
  // garante que todas as categorias tenham valor
  for (const k of Object.keys(DEV_FALLBACK_TARIFFS) as RideCategory[]) {
    if (!out[k]) out[k] = DEV_FALLBACK_TARIFFS[k];
  }
  return out;
}
