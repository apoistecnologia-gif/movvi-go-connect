import { supabase } from "@/integrations/supabase/client";

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

export async function computeDriverRoute({
  data,
}: {
  data: { origin: Point; destination: Point; stops?: Point[] };
}) {
  const { data: result, error } = await supabase.functions.invoke<DriverRouteResponse>(
    "passenger-routes-compute",
    {
      body: {
        origin: data.origin,
        destination: data.destination,
        stops: data.stops ?? [],
      },
    },
  );

  if (error || !result?.ok || !result.encodedPolyline) {
    throw new Error(routeErrorMessage(error ?? new Error("route_not_found")));
  }

  const steps = Array.isArray(result.steps)
    ? result.steps.filter(
        (step) =>
          Number.isFinite(Number(step.lat)) &&
          Number.isFinite(Number(step.lng)) &&
          typeof step.instruction === "string" &&
          step.instruction.trim().length > 0,
      )
    : [];

  return {
    encodedPolyline: result.encodedPolyline,
    distanceMeters: Number(result.distanceMeters),
    durationSeconds: Number(result.durationSeconds),
    steps: steps.map((step) => ({
      lat: Number(step.lat),
      lng: Number(step.lng),
      distanceMeters: Number(step.distanceMeters ?? 0),
      instruction: step.instruction.trim(),
      maneuver: step.maneuver ?? null,
    })) as DriverRouteStep[],
  };
}
