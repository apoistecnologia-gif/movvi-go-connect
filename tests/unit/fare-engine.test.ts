/* global Deno */
import { calculateServerFare } from "../../supabase/functions/_shared/fare-engine.ts";

function assertEquals(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertThrows(fn: () => unknown, includes: string): void {
  try {
    fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(includes)) return;
    throw new Error(`expected error containing ${includes}, got ${message}`);
  }
  throw new Error(`expected function to throw ${includes}`);
}

Deno.test("fare: uses the minimum fare when route components are lower", () => {
  const fare = calculateServerFare({
    category: "carros",
    distanceKm: 1,
    durationMin: 2,
    tariff: { base_fare: 2, fixed_fee: 0, per_km: 1, per_min: 0.2, min_fare: 8, dynamic_multiplier: 1 },
  });
  assertEquals(fare.totalCents, 800, "total cents");
  assertEquals(fare.minimumAdjustment, 4.6, "minimum adjustment");
});

Deno.test("fare: prices complete route including stops and dynamic multiplier", () => {
  const fare = calculateServerFare({
    category: "carros",
    distanceKm: 10,
    durationMin: 20,
    stopCount: 2,
    tariff: { base_fare: 3, fixed_fee: 1, per_km: 2, per_min: 0.5, min_fare: 0, stop_fee: 1.5, dynamic_multiplier: 1.25 },
  });
  assertEquals(fare.stopsFare, 3, "stops fare");
  assertEquals(fare.subtotal, 37, "subtotal");
  assertEquals(fare.totalCents, 4625, "total cents");
  assertEquals(fare.dynamicAdjustment, 9.25, "dynamic adjustment");
});

Deno.test("fare: adds freight service details without trusting client total", () => {
  const fare = calculateServerFare({
    category: "fretes",
    distanceKm: 5,
    durationMin: 10,
    tariff: {
      base_fare: 10,
      per_km: 1,
      per_min: 0,
      min_fare: 0,
      dynamic_multiplier: 1,
      helper1_fee: 20,
      heavy_furniture_fee: 15,
      assembly_fee: 12,
      stair_fee: 3,
    },
    serviceDetails: {
      ajudantes: "um",
      itemPesado: true,
      desmontar: true,
      retirada: { escadas: true, elevador: false, andar: 2 },
    },
  });
  assertEquals(fare.extras["1 ajudante"], 20, "helper");
  assertEquals(fare.extras["Item pesado"], 15, "heavy item");
  assertEquals(fare.extras["Montagem/desmontagem"], 12, "assembly");
  assertEquals(fare.extras["Retirada: escadas"], 6, "stairs");
  assertEquals(fare.totalCents, 6800, "total cents");
});

Deno.test("fare: rejects envio above maximum weight", () => {
  assertThrows(() => calculateServerFare({
    category: "envios",
    distanceKm: 2,
    durationMin: 5,
    tariff: { base_fare: 5, per_km: 1, per_min: 0, min_fare: 0, dynamic_multiplier: 1, max_weight_kg: 10, per_kg: 1 },
    serviceDetails: { weightKg: 11 },
  }), "Peso acima do máximo");
});

Deno.test("fare: caps discount and preserves integer cents", () => {
  const fare = calculateServerFare({
    category: "motos",
    distanceKm: 0.1,
    durationMin: 1,
    tariff: { base_fare: 0.1, fixed_fee: 0.2, per_km: 0.3, per_min: 0.1, min_fare: 0, dynamic_multiplier: 1 },
    discountAmount: 99,
  });
  assertEquals(Number.isInteger(fare.totalCents), true, "integer cents");
  assertEquals(fare.totalCents, 0, "discount cap");
});
