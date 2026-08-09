/* global Deno */
import { validateSettlementAmounts } from "../../src/lib/finance/settlementValidation.ts";

function assertThrows(fn: () => unknown, includes: string): void {
  try {
    fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(includes)) return;
    throw new Error(`expected ${includes}, got ${message}`);
  }
  throw new Error(`expected function to throw ${includes}`);
}

Deno.test("Settlement: accepts canonical 100% Driver distribution", () => {
  validateSettlementAmounts({
    passenger_charge_cents: 2850,
    driver_earning_cents: 2850,
    platform_fee_cents: 0,
    payment_provider_fee_cents: 85,
    refunded_amount_cents: 0,
  });
});

Deno.test("Settlement: accepts explicit platform split when backend returns one", () => {
  validateSettlementAmounts({
    passenger_charge_cents: 5000,
    driver_earning_cents: 4500,
    platform_fee_cents: 500,
    payment_provider_fee_cents: 100,
    refunded_amount_cents: 0,
  });
});

Deno.test("Settlement: rejects distribution that does not close to passenger charge", () => {
  assertThrows(
    () => validateSettlementAmounts({
      passenger_charge_cents: 5000,
      driver_earning_cents: 4900,
      platform_fee_cents: 50,
    }),
    "invalid_settlement_distribution",
  );
});

Deno.test("Settlement: rejects refund greater than passenger charge", () => {
  assertThrows(
    () => validateSettlementAmounts({
      passenger_charge_cents: 5000,
      driver_earning_cents: 5000,
      platform_fee_cents: 0,
      refunded_amount_cents: 5001,
    }),
    "invalid_settlement_refund",
  );
});

Deno.test("Settlement: rejects negative, fractional or unsafe money values", () => {
  for (const invalid of [-1, 10.5, Number.MAX_SAFE_INTEGER + 1]) {
    assertThrows(
      () => validateSettlementAmounts({
        passenger_charge_cents: invalid,
        driver_earning_cents: 0,
        platform_fee_cents: 0,
      }),
      "invalid_settlement_amount",
    );
  }
});
