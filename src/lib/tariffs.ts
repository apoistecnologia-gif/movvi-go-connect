import { supabase } from "@/integrations/supabase/client";
import {
  DEV_FALLBACK_TARIFFS,
  type RideCategory,
  type Tariff,
  type TariffMap,
} from "@/lib/rideCategories";

const TARIFF_FIELDS = [
  "base_fare",
  "min_fare",
  "per_km",
  "per_min",
  "stop_fee",
  "fixed_fee",
  "dynamic_multiplier",
  "helper1_fee",
  "helper2_fee",
  "heavy_furniture_fee",
  "assembly_fee",
  "packing_fee",
  "difficult_access_fee",
  "stair_fee",
  "heavy_vehicle_fee",
  "accident_fee",
  "platform_fee",
  "locked_wheels_fee",
  "garage_fee",
  "max_weight_kg",
  "per_kg",
] as const;

function isRideCategory(value: string): value is RideCategory {
  return value === "carros" || value === "motos" || value === "fretes" || value === "guincho" || value === "envios";
}

async function loadCanonicalRules() {
  const [{ data: categories, error: categoriesError }, { data: rules, error: rulesError }] = await Promise.all([
    supabase.from("ride_categories").select("id,code").eq("is_active", true),
    supabase
      .from("tariff_rules")
      .select("category_id,city,base_fare,min_fare,per_km,per_min,stop_fee,fixed_fee,dynamic_multiplier,helper1_fee,helper2_fee,heavy_furniture_fee,assembly_fee,packing_fee,difficult_access_fee,stair_fee,heavy_vehicle_fee,accident_fee,platform_fee,locked_wheels_fee,garage_fee,max_weight_kg,per_kg")
      .eq("is_active", true)
      .eq("city", "default"),
  ]);

  if (categoriesError) throw categoriesError;
  if (rulesError) throw rulesError;

  const codeById = new Map<string, RideCategory>();
  for (const category of categories ?? []) {
    const code = String(category.code);
    if (isRideCategory(code)) codeById.set(category.id, code);
  }

  return (rules ?? []).map((rule) => ({ rule, category: codeById.get(rule.category_id) ?? null }));
}

/**
 * Adaptador somente de leitura para a UI consolidada.
 * A tabela oficial usa `category_id` + colunas numéricas reais; o cálculo
 * autoritativo cobrado do passageiro continua sendo responsabilidade do
 * backend, nunca deste fallback de interface.
 */
export async function loadTariffs(): Promise<TariffMap> {
  try {
    const rows = await loadCanonicalRules();
    const out: TariffMap = { ...DEV_FALLBACK_TARIFFS };

    for (const { rule, category } of rows) {
      if (!category) continue;
      const fb = DEV_FALLBACK_TARIFFS[category];
      const tariff: Tariff = {
        base: Number(rule.base_fare ?? fb.base),
        min: Number(rule.min_fare ?? fb.min),
        perKm: Number(rule.per_km ?? fb.perKm),
        perMin: Number(rule.per_min ?? fb.perMin),
      };
      out[category] = tariff;
    }

    return out;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn(
        "[APOIS] Falha ao carregar tariff_rules; mantendo apenas fallback visual.",
        error instanceof Error ? error.message : error,
      );
    }
    return { ...DEV_FALLBACK_TARIFFS };
  }
}

/** Retorna categoria → campos numéricos reais, para telas administrativas somente de leitura. */
export async function loadTariffRulesRaw(): Promise<Record<string, Record<string, number>>> {
  const rows = await loadCanonicalRules();
  const grouped: Record<string, Record<string, number>> = {};

  for (const { rule, category } of rows) {
    if (!category) continue;
    const values: Record<string, number> = {};
    for (const field of TARIFF_FIELDS) {
      const value = Number(rule[field]);
      if (Number.isFinite(value)) values[field] = value;
    }
    grouped[category] = values;
  }

  return grouped;
}
