export type SettlementAmounts = {
  passenger_charge_cents: number;
  driver_earning_cents: number;
  platform_fee_cents: number;
  refunded_amount_cents?: number;
  payment_provider_fee_cents?: number;
};

function isSafeMoney(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

/**
 * Valida somente o resultado calculado pelo backend.
 * Esta função NÃO calcula preço, comissão ou ganho no cliente.
 */
export function validateSettlementAmounts(settlement: SettlementAmounts): void {
  const values = [
    settlement.passenger_charge_cents,
    settlement.driver_earning_cents,
    settlement.platform_fee_cents,
    settlement.refunded_amount_cents ?? 0,
    settlement.payment_provider_fee_cents ?? 0,
  ];
  if (!values.every(isSafeMoney)) throw new Error("invalid_settlement_amount");

  if (settlement.driver_earning_cents + settlement.platform_fee_cents !== settlement.passenger_charge_cents) {
    throw new Error("invalid_settlement_distribution");
  }

  if ((settlement.refunded_amount_cents ?? 0) > settlement.passenger_charge_cents) {
    throw new Error("invalid_settlement_refund");
  }
}
