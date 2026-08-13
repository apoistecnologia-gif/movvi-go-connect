/* global Deno */
import { haversineKm } from "../../supabase/functions/_shared/dispatch-engine.ts";
import { normalizeRideCategory } from "../../supabase/functions/_shared/ride-request.ts";

function assertEquals(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

function assertNear(actual: number, expected: number, tolerance: number, label: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected}±${tolerance}, got ${actual}`);
  }
}

Deno.test("Helpers: ride category aliases normalize to canonical domain", () => {
  assertEquals(normalizeRideCategory("carro"), "carros", "carro alias");
  assertEquals(normalizeRideCategory("moto"), "motos", "moto alias");
  assertEquals(normalizeRideCategory("fretes"), "fretes", "fretes canonical");
  assertEquals(normalizeRideCategory("unknown"), null, "unknown category");
});

Deno.test("Helpers: haversine is zero for the same point", () => {
  assertNear(haversineKm({ lat: -9.39, lng: -40.5 }, { lat: -9.39, lng: -40.5 }), 0, 1e-9, "same point");
});

Deno.test("Helpers: haversine is symmetric and returns a realistic local distance", () => {
  const a = { lat: -9.3891, lng: -40.5031 };
  const b = { lat: -9.4000, lng: -40.4900 };
  const ab = haversineKm(a, b);
  const ba = haversineKm(b, a);
  assertNear(ab, ba, 1e-9, "symmetry");
  if (!(ab > 1 && ab < 3)) throw new Error(`unexpected local distance: ${ab}`);
});
