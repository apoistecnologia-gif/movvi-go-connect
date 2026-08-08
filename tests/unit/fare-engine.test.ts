import { describe, expect, it } from "vitest";
import { calculateServerFare } from "../../supabase/functions/_shared/fare-engine";

describe("APOIS canonical fare engine", () => {
  it("uses the minimum fare when route components are lower", () => {
    const fare = calculateServerFare({
      category: "carros",
      distanceKm: 1,
      durationMin: 2,
      tariff: { base_fare: 2, fixed_fee: 0, per_km: 1, per_min: 0.2, min_fare: 8, dynamic_multiplier: 1 },
    });
    expect(fare.totalCents).toBe(800);
    expect(fare.minimumAdjustment).toBe(4.6);
  });

  it("prices the complete route including stops and dynamic multiplier", () => {
    const fare = calculateServerFare({
      category: "carros",
      distanceKm: 10,
      durationMin: 20,
      stopCount: 2,
      tariff: { base_fare: 3, fixed_fee: 1, per_km: 2, per_min: 0.5, min_fare: 0, stop_fee: 1.5, dynamic_multiplier: 1.25 },
    });
    expect(fare.stopsFare).toBe(3);
    expect(fare.subtotal).toBe(37);
    expect(fare.totalCents).toBe(4625);
    expect(fare.dynamicAdjustment).toBe(9.25);
  });

  it("adds freight service details without trusting a client total", () => {
    const fare = calculateServerFare({
      category: "fretes",
      distanceKm: 5,
      durationMin: 10,
      tariff: {
        base_fare: 10, per_km: 1, per_min: 0, min_fare: 0, dynamic_multiplier: 1,
        helper1_fee: 20, heavy_furniture_fee: 15, assembly_fee: 12, stair_fee: 3,
      },
      serviceDetails: {
        ajudantes: "um",
        itemPesado: true,
        desmontar: true,
        retirada: { escadas: true, elevador: false, andar: 2 },
      },
    });
    expect(fare.extras["1 ajudante"]).toBe(20);
    expect(fare.extras["Item pesado"]).toBe(15);
    expect(fare.extras["Montagem/desmontagem"]).toBe(12);
    expect(fare.extras["Retirada: escadas"]).toBe(6);
    expect(fare.totalCents).toBe(6800);
  });

  it("rejects an envio above the configured maximum weight", () => {
    expect(() => calculateServerFare({
      category: "envios",
      distanceKm: 2,
      durationMin: 5,
      tariff: { base_fare: 5, per_km: 1, per_min: 0, min_fare: 0, dynamic_multiplier: 1, max_weight_kg: 10, per_kg: 1 },
      serviceDetails: { weightKg: 11 },
    })).toThrow("Peso acima do máximo");
  });

  it("caps discount at the charged amount and preserves integer cents", () => {
    const fare = calculateServerFare({
      category: "motos",
      distanceKm: 0.1,
      durationMin: 1,
      tariff: { base_fare: 0.1, fixed_fee: 0.2, per_km: 0.3, per_min: 0.1, min_fare: 0, dynamic_multiplier: 1 },
      discountAmount: 99,
    });
    expect(Number.isInteger(fare.totalCents)).toBe(true);
    expect(fare.totalCents).toBe(0);
  });
});
