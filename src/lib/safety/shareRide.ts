import { toast } from "sonner";

export type RideStatus =
  | "aguardando"
  | "motorista_a_caminho"
  | "motorista_chegou"
  | "em_viagem"
  | "finalizada"
  | string;

export function statusLabel(status: RideStatus | null | undefined): string {
  switch (status) {
    case "motorista_a_caminho":
      return "Motorista a caminho";
    case "motorista_chegou":
      return "Motorista chegou ao ponto de embarque";
    case "em_viagem":
      return "Em viagem";
    case "finalizada":
      return "Viagem finalizada";
    default:
      return "Viagem em andamento";
  }
}

export interface ShareRideInput {
  role: "passenger" | "driver";
  status: RideStatus | null | undefined;
  driverName?: string | null;
  passengerName?: string | null;
  vehicleModel?: string | null;
  vehicleColor?: string | null;
  vehiclePlate?: string | null;
  originName?: string | null;
  destinationName?: string | null;
  currentLat?: number | null;
  currentLng?: number | null;
  /** Live tracking link (movvi.app/t/{token}). When present, replaces the static coords. */
  trackingUrl?: string | null;
}

export function buildShareText(input: ShareRideInput): string {
  const lines: string[] = ["🚗 MOVVI — Acompanhe minha viagem em tempo real", ""];
  lines.push(`Status: ${statusLabel(input.status)}`);
  if (input.role === "passenger") {
    if (input.driverName) lines.push(`Motorista: ${input.driverName}`);
    const veh = [input.vehicleColor, input.vehicleModel].filter(Boolean).join(" ");
    if (veh || input.vehiclePlate) {
      lines.push(`Veículo: ${veh || "—"}${input.vehiclePlate ? ` (${input.vehiclePlate})` : ""}`);
    }
  } else {
    if (input.passengerName) lines.push(`Passageiro: ${input.passengerName}`);
  }
  if (input.originName) lines.push(`Origem: ${input.originName}`);
  if (input.destinationName) lines.push(`Destino: ${input.destinationName}`);
  if (input.trackingUrl) {
    lines.push("", `Acompanhar ao vivo: ${input.trackingUrl}`);
  } else if (input.currentLat != null && input.currentLng != null) {
    lines.push(
      `Localização aproximada: https://www.google.com/maps?q=${input.currentLat},${input.currentLng}`,
    );
  }
  lines.push("", "Enviado pela MOVVI para sua segurança.");
  return lines.join("\n");
}


export async function shareRide(input: ShareRideInput): Promise<void> {
  const text = buildShareText(input);
  try {
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (typeof nav.share === "function") {
      await nav.share({ title: "MOVVI — Minha corrida", text });
      return;
    }
    await navigator.clipboard.writeText(text);
    toast.success("Detalhes da corrida copiados", {
      description: "Cole no WhatsApp ou aplicativo de mensagens.",
    });
  } catch (err) {
    // user canceled or clipboard denied
    if ((err as Error)?.name === "AbortError") return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Detalhes copiados para a área de transferência");
    } catch {
      toast.error("Não foi possível compartilhar. Tente novamente.");
    }
  }
}

export async function getApproxLocation(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 4000, maximumAge: 0 },
    );
  });
}
