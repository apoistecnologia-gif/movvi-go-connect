import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

const LatLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const InputSchema = z.object({
  origin: LatLngSchema,
  destination: LatLngSchema,
});

export type RouteResult = {
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: string;
};

// Requer usuário autenticado para evitar consumo abusivo da chave do Google Maps.
export const computeRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<RouteResult> => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const connKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!lovableKey || !connKey) {
      throw new Error("Google Maps connector não configurado.");
    }

    const body = {
      origin: { location: { latLng: { latitude: data.origin.lat, longitude: data.origin.lng } } },
      destination: { location: { latLng: { latitude: data.destination.lat, longitude: data.destination.lng } } },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      polylineEncoding: "ENCODED_POLYLINE",
      languageCode: "pt-BR",
      regionCode: "BR",
    };

    const res = await fetch(`${GATEWAY_URL}/routes/directions/v2:computeRoutes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": connKey,
        "Content-Type": "application/json",
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Routes API ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      routes?: Array<{
        distanceMeters?: number;
        duration?: string;
        polyline?: { encodedPolyline?: string };
      }>;
    };
    const route = json.routes?.[0];
    if (!route?.polyline?.encodedPolyline) {
      throw new Error("Nenhuma rota encontrada para esse trajeto.");
    }
    const durationSeconds = route.duration ? parseInt(route.duration.replace("s", ""), 10) : 0;

    return {
      distanceMeters: route.distanceMeters ?? 0,
      durationSeconds,
      encodedPolyline: route.polyline.encodedPolyline,
    };
  });
