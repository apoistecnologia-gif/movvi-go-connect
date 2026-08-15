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

  return {
    encodedPolyline: result.encodedPolyline,
    distanceMeters: Number(result.distanceMeters),
    durationSeconds: Number(result.durationSeconds),
    // A Edge Function oficial retorna a geometria, distância e duração. As
    // instruções curva-a-curva não fazem parte desse contrato; a navegação
    // visual continua funcionando normalmente e a lista fica vazia.
    steps: [] as DriverRouteStep[],
  };
}
