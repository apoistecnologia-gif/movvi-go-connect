import { supabase } from "@/integrations/supabase/client";
import {
  DEV_FALLBACK_TARIFFS,
  type RideCategory,
  type Tariff,
  type TariffMap,
} from "@/lib/rideCategories";

/**
 * Carrega tarifas a partir da tabela `tariff_rules` (fonte oficial do admin).
 * Cada linha tem `category_key` + `field_key` + `value` numérico.
 *
 * Mapeia para o tipo `Tariff` legado usado no cálculo do passageiro:
 *   base ← base_fare | base
 *   perKm ← per_km
 *   perMin ← per_min
 *   min ← min_fare | min
 *
 * Campos faltantes caem para o DEV_FALLBACK da categoria.
 */
export async function loadTariffs(): Promise<TariffMap> {
  const { data, error } = await supabase
    .from("tariff_rules")
    .select("category_key, field_key, value");

  if (error) {
    console.warn("[MOVVI] Falha ao carregar tariff_rules, usando fallback dev:", error.message);
    return { ...DEV_FALLBACK_TARIFFS };
  }

  const grouped: Record<string, Record<string, number>> = {};
  for (const row of data ?? []) {
    const cat = String(row.category_key);
    const field = String(row.field_key);
    const value = Number(row.value);
    if (!Number.isFinite(value)) continue;
    (grouped[cat] ??= {})[field] = value;
  }

  const out: TariffMap = {};
  for (const k of Object.keys(DEV_FALLBACK_TARIFFS) as RideCategory[]) {
    const g = grouped[k] ?? {};
    const fb = DEV_FALLBACK_TARIFFS[k];
    const tariff: Tariff = {
      base: g.base_fare ?? g.base ?? fb.base,
      perKm: g.per_km ?? fb.perKm,
      perMin: g.per_min ?? fb.perMin,
      min: g.min_fare ?? g.min ?? fb.min,
    };
    out[k] = tariff;
  }
  return out;
}

/** Retorna o mapa bruto categoria → { field_key: value } para uso no admin de preços. */
export async function loadTariffRulesRaw(): Promise<Record<string, Record<string, number>>> {
  const { data, error } = await supabase
    .from("tariff_rules")
    .select("category_key, field_key, value");
  if (error) throw error;
  const grouped: Record<string, Record<string, number>> = {};
  for (const row of data ?? []) {
    const cat = String(row.category_key);
    const field = String(row.field_key);
    const value = Number(row.value);
    if (!Number.isFinite(value)) continue;
    (grouped[cat] ??= {})[field] = value;
  }
  return grouped;
}
