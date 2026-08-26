import { supabase } from "@/integrations/supabase/client";
import { isBrazilCoordinate } from "@/lib/googleMaps";

export type DriverRouteStep = {
  lat: number;
  lng: number;
  distanceMeters: number;
  instruction: string;
  maneuver?: string | null;
};

type Point = { lat: number; lng: number };

type DriverRouteResponse = {
  ok: boolean;
  distanceMeters: number;
  distanceKm: number;
  durationSeconds: number;
  durationMinutes: number;
  encodedPolyline: string;
  provider: string;
  steps?: DriverRouteStep[];
};

function routeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/configuration|missing/i.test(message)) return "O cálculo de rota ainda não está configurado.";
  if (/unauthorized|jwt/i.test(message)) return "Sua sessão expirou. Entre novamente.";
  return "Não foi possível calcular a rota agora.";
}

function normalizePoint(point: Point): Point | null {
  const lat = Number(point?.lat);
  const lng = Number(point?.lng);
  return isBrazilCoordinate(lat, lng) ? { lat, lng } : null;
}

export async function computeDriverRoute({
  data,
}: {
  data: { origin: Point; destination: Point; stops?: Point[] };
}) {
  const origin = normalizePoint(data.origin);
  const destination = normalizePoint(data.destination);
  if (!origin || !destination) {
    throw new Error("Não foi possível traçar a rota porque o embarque ou destino está com localização inválida.");
  }
  const stops = (data.stops ?? []).map(normalizePoint).filter((point): point is Point => point !== null);

  const { data: result, error } = await supabase.functions.invoke<DriverRouteResponse>(
    "passenger-routes-compute",
    {
      body: {
        origin,
        destination,
        stops,
      },
    },
  );

  if (error || !result?.ok || !result.encodedPolyline) {
    throw new Error(routeErrorMessage(error ?? new Error("route_not_found")));
  }

  const distanceMeters = Number(result.distanceMeters);
  const durationSeconds = Number(result.durationSeconds);
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0 || !Number.isFinite(durationSeconds) || durationSeconds < 0) {
    throw new Error("A rota retornou distância ou duração inválida. Tente novamente.");
  }

  const steps = Array.isArray(result.steps)
    ? result.steps.filter((step) => {
        const lat = Number(step.lat);
        const lng = Number(step.lng);
        const stepDistance = Number(step.distanceMeters ?? 0);
        return (
          isBrazilCoordinate(lat, lng) &&
          Number.isFinite(stepDistance) &&
          stepDistance >= 0 &&
          typeof step.instruction === "string" &&
          step.instruction.trim().length > 0
        );
      })
    : [];

  return {
    encodedPolyline: result.encodedPolyline,
    distanceMeters,
    durationSeconds,
    steps: steps.map((step) => ({
      lat: Number(step.lat),
      lng: Number(step.lng),
      distanceMeters: Number(step.distanceMeters ?? 0),
      instruction: step.instruction.trim(),
      maneuver: step.maneuver ?? null,
    })) as DriverRouteStep[],
  };
}
