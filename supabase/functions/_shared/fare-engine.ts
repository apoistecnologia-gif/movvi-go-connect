export type ServiceDetails = Record<string, unknown> | null | undefined;

export type FareBreakdown = {
  /** Backward-compatible base after minimum fare, before stops/extras/dynamic. */
  base: number;
  baseFare: number;
  fixedFee: number;
  distanceFare: number;
  timeFare: number;
  minimumAdjustment: number;
  stopsFare: number;
  extras: Record<string, number>;
  dynamicMultiplier: number;
  dynamicAdjustment: number;
  discount: number;
  subtotal: number;
  total: number;
  totalCents: number;
};

function yes(value: unknown): boolean {
  return value === true || ["sim", "yes", "true", "1"].includes(String(value ?? "").trim().toLowerCase());
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function nonNegativeNumber(value: unknown): number {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function cents(value: number): number {
  if (!Number.isFinite(value)) throw new Error("invalid_money_value");
  return Math.round((value + Number.EPSILON) * 100);
}

function money(valueInCents: number): number {
  return valueInCents / 100;
}

function addMoney(target: Record<string, number>, key: string, amount: number): void {
  const amountCents = cents(Math.max(0, amount));
  if (amountCents > 0) target[key] = money(amountCents);
}

/**
 * Authoritative APOIS fare calculation.
 *
 * Money is converted to integer cents before aggregation. The public result
 * keeps decimal BRL values for existing clients while also exposing totalCents
 * for settlement/ledger code.
 */
export function calculateServerFare(args: {
  category: string;
  distanceKm: number;
  durationMin: number;
  tariff: Record<string, number>;
  stopCount?: number;
  serviceDetails?: ServiceDetails;
  discountAmount?: number;
}): FareBreakdown {
  const category = String(args.category ?? "").trim().toLowerCase();
  const tariff = args.tariff ?? {};
  const distanceKm = Math.max(0, nonNegativeNumber(args.distanceKm));
  const durationMin = Math.max(0, nonNegativeNumber(args.durationMin));
  const stopCount = Math.max(0, Math.floor(nonNegativeNumber(args.stopCount)));

  const baseFareCents = cents(Math.max(0, tariff.base_fare ?? tariff.call_out_fee ?? 0));
  const fixedFeeCents = cents(Math.max(0, tariff.fixed_fee ?? 0));
  const distanceFareCents = cents(Math.max(0, tariff.per_km ?? 0) * distanceKm);
  const timeFareCents = cents(Math.max(0, tariff.per_min ?? 0) * durationMin);
  const minimumFareCents = cents(Math.max(0, tariff.min_fare ?? 0));
  const rawBaseCents = baseFareCents + fixedFeeCents + distanceFareCents + timeFareCents;
  const effectiveBaseCents = Math.max(minimumFareCents, rawBaseCents);
  const minimumAdjustmentCents = Math.max(0, effectiveBaseCents - rawBaseCents);

  const details = record(args.serviceDetails);
  const extras: Record<string, number> = {};
  const stopsFareCents = cents(Math.max(0, tariff.stop_fee ?? 0) * stopCount);
  if (stopsFareCents > 0) extras["Paradas adicionais"] = money(stopsFareCents);

  if (category === "fretes") {
    if (details.ajudantes === "um") addMoney(extras, "1 ajudante", tariff.helper1_fee ?? 0);
    if (details.ajudantes === "dois") addMoney(extras, "2 ajudantes", tariff.helper2_fee ?? 0);
    if (yes(details.itemPesado)) addMoney(extras, "Item pesado", tariff.heavy_furniture_fee ?? 0);
    if (yes(details.desmontar)) addMoney(extras, "Montagem/desmontagem", tariff.assembly_fee ?? 0);
    if (yes(details.embalar)) addMoney(extras, "Embalagem", tariff.packing_fee ?? 0);

    for (const [label, location] of [
      ["Retirada", record(details.retirada)],
      ["Entrega", record(details.entrega)],
    ] as const) {
      if (yes(location.dificilAcesso)) addMoney(extras, `${label}: acesso difícil`, tariff.difficult_access_fee ?? 0);
      if (yes(location.escadas) && !yes(location.elevador)) {
        const floors = Math.max(1, nonNegativeNumber(location.andar));
        addMoney(extras, `${label}: escadas`, (tariff.stair_fee ?? 0) * floors);
      }
    }
  }

  if (category === "guincho") {
    if (["utilitario", "caminhonete"].includes(String(details.tipoVeiculo ?? "").toLowerCase())) {
      addMoney(extras, "Veículo pesado", tariff.heavy_vehicle_fee ?? 0);
    }
    if (yes(details.dificilAcesso)) addMoney(extras, "Acesso difícil", tariff.difficult_access_fee ?? 0);
    if (yes(details.acidente)) addMoney(extras, "Veículo acidentado", tariff.accident_fee ?? 0);
    if (yes(details.precisaPlataforma)) addMoney(extras, "Plataforma", tariff.platform_fee ?? 0);
    if (yes(details.rodasTravadas)) addMoney(extras, "Rodas travadas", tariff.locked_wheels_fee ?? 0);
    if (yes(details.garagemSubsolo)) addMoney(extras, "Garagem/subsolo", tariff.garage_fee ?? 0);
  }

  if (category === "envios") {
    const weightKg = nonNegativeNumber(details.weightKg);
    const maxWeight = Math.max(0, tariff.max_weight_kg ?? 0);
    if (maxWeight > 0 && weightKg > maxWeight) throw new Error(`Peso acima do máximo de ${maxWeight} kg para Envios.`);
    addMoney(extras, "Peso", weightKg * Math.max(0, tariff.per_kg ?? 0));
  }

  const extrasCents = Object.values(extras).reduce((sum, value) => sum + cents(value), 0);
  const subtotalCents = effectiveBaseCents + extrasCents;
  const multiplier = Math.max(1, Number(tariff.dynamic_multiplier ?? 1));
  if (!Number.isFinite(multiplier)) throw new Error("invalid_dynamic_multiplier");
  const multipliedCents = cents(money(subtotalCents) * multiplier);
  const dynamicAdjustmentCents = Math.max(0, multipliedCents - subtotalCents);

  const requestedDiscountCents = cents(Math.max(0, nonNegativeNumber(args.discountAmount)));
  const discountCents = Math.min(requestedDiscountCents, multipliedCents);
  const totalCents = Math.max(0, multipliedCents - discountCents);

  return {
    base: money(effectiveBaseCents),
    baseFare: money(baseFareCents),
    fixedFee: money(fixedFeeCents),
    distanceFare: money(distanceFareCents),
    timeFare: money(timeFareCents),
    minimumAdjustment: money(minimumAdjustmentCents),
    stopsFare: money(stopsFareCents),
    extras,
    dynamicMultiplier: multiplier,
    dynamicAdjustment: money(dynamicAdjustmentCents),
    discount: money(discountCents),
    subtotal: money(subtotalCents),
    total: money(totalCents),
    totalCents,
  };
}
