import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  isRideCategoryEnabled,
  parseRideFeatureFlags,
} from "../src/lib/rideFeatureFlags.core.ts";

describe("partner ride feature flags", () => {
  test("removes Guincho and Fretes from new partner operations", () => {
    const flags = parseRideFeatureFlags({
      feature_guincho_enabled: false,
      feature_fretes_enabled: "false",
    });
    assert.equal(isRideCategoryEnabled("guincho", flags), false);
    assert.equal(isRideCategoryEnabled("fretes", flags), false);
  });

  test("keeps Carro, Moto and Entregas enabled", () => {
    const flags = parseRideFeatureFlags(null);
    assert.equal(isRideCategoryEnabled("carros", flags), true);
    assert.equal(isRideCategoryEnabled("motos", flags), true);
    assert.equal(isRideCategoryEnabled("envios", flags), true);
  });
});
