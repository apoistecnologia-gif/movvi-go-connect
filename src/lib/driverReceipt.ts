// MOVVI DRIVE — gerador de recibo de corrida em PDF.
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

function brl(v: number | null | undefined) {
  return (Number(v ?? 0)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR");
}

export function generateRideReceiptPDF(ride: ReceiptRide): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const value = ride.final_price ?? ride.estimated_price ?? 0;

  doc.setFillColor(141, 217, 43);
  doc.rect(0, 0, 210, 24, "F");
  doc.setTextColor(5, 7, 13);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("MOVVI DRIVE — Recibo de Corrida", 14, 15);

  doc.setTextColor(20, 20, 20);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`ID da corrida: ${ride.id}`, 14, 32);
  doc.text(`Emitido em: ${new Date().toLocaleString("pt-BR")}`, 14, 38);

  autoTable(doc, {
    startY: 44,
    theme: "grid",
    head: [["Detalhes da corrida", ""]],
    body: [
      ["Categoria", ride.category ?? "—"],
      ["Solicitada em", fmt(ride.created_at)],
      ["Finalizada em", fmt(ride.completed_at)],
      ["Origem", ride.origin_name],
      ["Destino", ride.destination_name],
      ["Distância", ride.distance_km != null ? `${Number(ride.distance_km).toFixed(2)} km` : "—"],
      ["Duração", ride.duration_min != null ? `${Math.round(Number(ride.duration_min))} min` : "—"],
      ["Motorista", ride.driver_name ?? "—"],
      ["Veículo", ride.driver_vehicle ?? "—"],
      ["Passageiro", ride.passenger_name ?? "—"],
      ["Pagamento", ride.payment_method ?? "—"],
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
  doc.text(brl(value), 196, finalY + 19, { align: "right" });

  doc.setTextColor(120, 120, 120);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(
    "Este recibo é uma confirmação de viagem realizada na plataforma MOVVI DRIVE.",
    14,
    finalY + 36,
  );

  return doc;
}

export function downloadRideReceipt(ride: ReceiptRide) {
  const doc = generateRideReceiptPDF(ride);
  doc.save(`movvi-corrida-${ride.id.slice(0, 8)}.pdf`);
}
