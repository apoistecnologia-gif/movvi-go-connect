export type ReceiptData = {
  rideId: string;
  date: string; // ISO
  origin: string;
  destination: string;
  driverName?: string | null;
  passengerName?: string | null;
  vehicle?: string | null;
  plate?: string | null;
  paymentMethod?: string | null;
  value?: number | null;
  status: string;
  distanceKm?: number | null;
  durationMin?: number | null;
};

export const APOIS_RECEIPT_DISCLAIMER =
  "A APOIS não recebe pagamentos de corridas; o pagamento é acertado diretamente com o motorista.";

export function formatBRL(v: number | null | undefined) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function buildReceiptText(r: ReceiptData): string {
  const lines = [
    "🚗 APOIS — Recibo de corrida",
    "",
    `ID: #${r.rideId.slice(0, 8).toUpperCase()}`,
    `Data: ${new Date(r.date).toLocaleString("pt-BR")}`,
    `Status: ${r.status}`,
    "",
    `Origem: ${r.origin}`,
    `Destino: ${r.destination}`,
  ];
  if (r.driverName) lines.push(`Motorista: ${r.driverName}`);
  if (r.passengerName) lines.push(`Passageiro: ${r.passengerName}`);
  if (r.vehicle || r.plate)
    lines.push(`Veículo: ${[r.vehicle, r.plate].filter(Boolean).join(" · ")}`);
  if (r.distanceKm != null) lines.push(`Distância: ${Number(r.distanceKm).toFixed(1)} km`);
  if (r.durationMin != null) lines.push(`Duração: ${Math.round(Number(r.durationMin))} min`);
  if (r.paymentMethod) lines.push(`Pagamento: ${r.paymentMethod}`);
  if (r.value != null) lines.push(`Valor: ${formatBRL(r.value)}`);
  lines.push("", APOIS_RECEIPT_DISCLAIMER);
  return lines.join("\n");
}

export async function shareReceipt(r: ReceiptData): Promise<"shared" | "copied"> {
  const text = buildReceiptText(r);
  const title = `APOIS — Recibo #${r.rideId.slice(0, 8).toUpperCase()}`;
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  if (nav && typeof nav.share === "function") {
    try {
      await nav.share({ title, text });
      return "shared";
    } catch {
      /* fall through to clipboard */
    }
  }
  if (nav?.clipboard?.writeText) await nav.clipboard.writeText(text);
  return "copied";
}

export async function copyReceipt(r: ReceiptData): Promise<void> {
  const text = buildReceiptText(r);
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  }
}
