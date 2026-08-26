import { toast } from "sonner";

export type RideStatus =
  | "aguardando"
  | "motorista_a_caminho"
  | "motorista_chegou"
  | "em_viagem"
  | "finalizada"
  | string;

function cleanLine(value: unknown, maxLength = 160): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function validCoordinate(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function safeTrackingUrl(value: unknown): string | null {
  const raw = cleanLine(value, 2048);
  if (!raw) return null;
  if (raw.startsWith("/t/")) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!/^\/t\/[0-9a-f-]+$/i.test(url.pathname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

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
  /** Live tracking link (/t/{token}). When present, replaces the static coords. */
  trackingUrl?: string | null;
}

export function buildShareText(input: ShareRideInput): string {
  const lines: string[] = ["🚗 APOIS — Acompanhe minha viagem em tempo real", ""];
  lines.push(`Status: ${statusLabel(input.status)}`);
  if (input.role === "passenger") {
    const driverName = cleanLine(input.driverName);
    if (driverName) lines.push(`Motorista: ${driverName}`);
    const vehicleColor = cleanLine(input.vehicleColor, 60);
    const vehicleModel = cleanLine(input.vehicleModel, 100);
    const vehiclePlate = cleanLine(input.vehiclePlate, 20).toUpperCase();
    const vehicle = [vehicleColor, vehicleModel].filter(Boolean).join(" ");
    if (vehicle || vehiclePlate) {
      lines.push(`Veículo: ${vehicle || "—"}${vehiclePlate ? ` (${vehiclePlate})` : ""}`);
    }
  } else {
    const passengerName = cleanLine(input.passengerName);
    if (passengerName) lines.push(`Passageiro: ${passengerName}`);
  }

  const originName = cleanLine(input.originName, 220);
  const destinationName = cleanLine(input.destinationName, 220);
  if (originName) lines.push(`Origem: ${originName}`);
  if (destinationName) lines.push(`Destino: ${destinationName}`);

  const trackingUrl = safeTrackingUrl(input.trackingUrl);
  if (trackingUrl) {
    lines.push("", `Acompanhar ao vivo: ${trackingUrl}`);
  } else if (validCoordinate(input.currentLat, input.currentLng)) {
    lines.push(
      `Localização aproximada: https://www.google.com/maps?q=${input.currentLat},${input.currentLng}`,
    );
  }
  lines.push("", "Enviado pela APOIS para sua segurança.");
  return lines.join("\n");
}

export async function shareRide(input: ShareRideInput): Promise<void> {
  const text = buildShareText(input);
  try {
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (typeof nav.share === "function") {
      await nav.share({ title: "APOIS — Minha corrida", text });
      return;
    }
    await navigator.clipboard.writeText(text);
    toast.success("Detalhes da corrida copiados", {
      description: "Cole no WhatsApp ou aplicativo de mensagens.",
    });
  } catch (err) {
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
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        resolve(validCoordinate(lat, lng) ? { lat, lng } : null);
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 4000, maximumAge: 0 },
    );
  });
}
