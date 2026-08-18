// APOIS — gerador de recibo de corrida em PDF.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type ReceiptRide = {
  id: string;
  created_at: string | null;
  completed_at: string | null;
  origin_name: string;
  destination_name: string;
  distance_km: number | null;
  duration_min: number | null;
  final_price: number | null;
  estimated_price: number | null;
  payment_method: string | null;
  category: string | null;
  driver_name?: string | null;
  driver_vehicle?: string | null;
  passenger_name?: string | null;
};

function finiteNonNegative(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function cleanText(value: unknown, fallback = "—", maxLength = 500): string {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  return text || fallback;
}

function brl(value: number | null | undefined) {
  const parsed = finiteNonNegative(value);
  if (parsed === null) return "Valor indisponível";
  return parsed.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmt(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Data indisponível";
  return date.toLocaleString("pt-BR");
}

function categoryLabel(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  const labels: Record<string, string> = {
    carro: "Carro",
    carros: "Carro",
    moto: "Moto",
    motos: "Moto",
    frete: "Fretes e Mudanças",
    fretes: "Fretes e Mudanças",
    guincho: "Guincho",
    envio: "Envios",
    envios: "Envios",
  };
  return labels[normalized] ?? (normalized ? "Categoria cadastrada" : "—");
}

function paymentLabel(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "—";
  if (normalized === "cash" || normalized === "dinheiro") return "Dinheiro";
  if (normalized === "pix") return "Pix";
  if (normalized === "wallet" || normalized === "carteira") return "Carteira APOIS";
  if (normalized.includes("credit") || normalized.includes("credito")) return "Cartão de crédito";
  if (normalized.includes("debit") || normalized.includes("debito")) return "Cartão de débito";
  return "Forma de pagamento registrada";
}

function metric(value: unknown, digits: number, suffix: string): string {
  const parsed = finiteNonNegative(value);
  if (parsed === null) return "—";
  return `${digits === 0 ? Math.round(parsed) : parsed.toFixed(digits)} ${suffix}`;
}

export function generateRideReceiptPDF(ride: ReceiptRide): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const finalPrice = finiteNonNegative(ride.final_price);
  const estimatedPrice = finiteNonNegative(ride.estimated_price);
  const value = finalPrice ?? estimatedPrice;
  const rideId = cleanText(ride.id, "ID indisponível", 80);

  doc.setFillColor(141, 217, 43);
  doc.rect(0, 0, 210, 24, "F");
  doc.setTextColor(5, 7, 13);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("APOIS — Recibo de Corrida", 14, 15);

  doc.setTextColor(20, 20, 20);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`ID da corrida: ${rideId}`, 14, 32);
  doc.text(`Emitido em: ${new Date().toLocaleString("pt-BR")}`, 14, 38);

  autoTable(doc, {
    startY: 44,
    theme: "grid",
    head: [["Detalhes da corrida", ""]],
    body: [
      ["Categoria", categoryLabel(ride.category)],
      ["Solicitada em", fmt(ride.created_at)],
      ["Finalizada em", fmt(ride.completed_at)],
      ["Origem", cleanText(ride.origin_name)],
      ["Destino", cleanText(ride.destination_name)],
      ["Distância", metric(ride.distance_km, 2, "km")],
      ["Duração", metric(ride.duration_min, 0, "min")],
      ["Motorista", cleanText(ride.driver_name)],
      ["Veículo", cleanText(ride.driver_vehicle)],
      ["Passageiro", cleanText(ride.passenger_name)],
      ["Pagamento", paymentLabel(ride.payment_method)],
    ],
    styles: { fontSize: 10, cellPadding: 3 },
    headStyles: { fillColor: [18, 24, 38], textColor: [255, 255, 255] },
  });

  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 100;

  doc.setFillColor(18, 24, 38);
  doc.rect(14, finalY + 8, 182, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Total pago", 20, finalY + 19);
  doc.setFontSize(16);
  doc.text(value === null ? "Valor indisponível" : brl(value), 196, finalY + 19, { align: "right" });

  doc.setTextColor(120, 120, 120);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(
    "Este recibo é uma confirmação de viagem realizada na plataforma APOIS.",
    14,
    finalY + 36,
  );

  return doc;
}

export function downloadRideReceipt(ride: ReceiptRide) {
  const doc = generateRideReceiptPDF(ride);
  const safeId = String(ride.id ?? "")
    .replace(/[^a-zA-Z0-9-]/g, "")
    .slice(0, 8) || "recibo";
  doc.save(`apois-corrida-${safeId}.pdf`);
}
