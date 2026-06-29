import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

export type GeocodeComponents = {
  rua?: string;
  numero?: string;
  povoado?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  estadoSigla?: string;
  pais?: string;
};

export type GeocodeResult = {
  address: string;       // endereço completo formatado
  friendly: string;      // primeira linha (povoado/bairro). Vazio se não houver.
  region: string;        // "Cidade - UF"
  approximate: boolean;  // true quando só temos município (sem bairro/povoado)
  /**
   * Confiabilidade do endereço retornado pelo Google.
   * - "exact": location_type=ROOFTOP, endereço é o ponto exato.
   * - "approximate": location_type ∈ {APPROXIMATE, GEOMETRIC_CENTER, RANGE_INTERPOLATED}
   *   ou partial_match=true. NÃO mostrar rua/número como exato — preferir coordenadas + referência.
   */
  precision: "exact" | "approximate";
  locationType: string;  // ROOFTOP | RANGE_INTERPOLATED | GEOMETRIC_CENTER | APPROXIMATE | ""
  partialMatch: boolean;
  plusCode?: string;     // global_code do plus_code, se houver
  types: string[];       // types do primeiro resultado
  /** Coordenadas retornadas pelo Google (geometry.location) — usadas para medir distância do GPS. */
  geocodedLat?: number;
  geocodedLng?: number;
  components: GeocodeComponents;
  diagnostic?: ReverseGeocodeDiagnostic;
};

export type ReverseGeocodeDiagnostic = {
  latitude: number;
  longitude: number;
  requestUrl: string;
  httpStatus: number | null;
  responseBody: unknown;
  googleStatus?: string;
  googleError?: string;
  rejectionReason?: string;
  failureReason?: string;
};

type GResult = {
  formatted_address?: string;
  partial_match?: boolean;
  types?: string[];
  geometry?: {
    location_type?: string;
    location?: { lat: number; lng: number };
  };
  plus_code?: {
    global_code?: string;
    compound_code?: string;
  };
  address_components?: Array<{
    long_name: string;
    short_name: string;
    types: string[];
  }>;
};

function pick(results: GResult[], types: string[]): { long: string; short: string } | undefined {
  for (const r of results) {
    for (const c of r.address_components ?? []) {
      if (types.every((t) => c.types.includes(t))) {
        return { long: c.long_name, short: c.short_name };
      }
    }
  }
  return undefined;
}

function emptyGeocode(diagnostic?: ReverseGeocodeDiagnostic): GeocodeResult {
  return {
  address: "",
  friendly: "",
  region: "",
  approximate: false,
  precision: "approximate",
  locationType: "",
  partialMatch: false,
  types: [],
  components: {},
  diagnostic,
  };
}

function stringifyDiagnosticBody(body: unknown) {
  try {
    return typeof body === "string" ? body : JSON.stringify(body, null, 2);
  } catch {
    return String(body);
  }
}

// Requer usuário autenticado para evitar abuso/scraping da chave Google Maps.
export const reverseGeocode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>

    z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<GeocodeResult> => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const connKey = process.env.GOOGLE_MAPS_API_KEY;
    const platformKey = process.env.GOOGLE_MAPS_PLATFORM_API_KEY;

    const url = `${GATEWAY_URL}/maps/api/geocode/json?latlng=${data.lat},${data.lng}&language=pt-BR&region=br`;
    const diagnosticBase: ReverseGeocodeDiagnostic = {
      latitude: data.lat,
      longitude: data.lng,
      requestUrl: url,
      httpStatus: null,
      responseBody: null,
    };

    console.log("[MOVVI Reverse Geocoding Diagnostic] latitude:", data.lat);
    console.log("[MOVVI Reverse Geocoding Diagnostic] longitude:", data.lng);
    console.log("[MOVVI Reverse Geocoding Diagnostic] request URL:", url);
    console.log("[MOVVI Reverse Geocoding Diagnostic] GOOGLE_MAPS_API_KEY:", connKey ? "present" : "missing");
    console.log("[MOVVI Reverse Geocoding Diagnostic] GOOGLE_MAPS_PLATFORM_API_KEY:", platformKey ? "present" : "missing");
    console.log("[MOVVI Reverse Geocoding Diagnostic] LOVABLE_API_KEY:", lovableKey ? "present" : "missing");

    if (!lovableKey || !connKey) {
      const missing = [
        !lovableKey ? "LOVABLE_API_KEY" : null,
        !connKey ? "GOOGLE_MAPS_API_KEY" : null,
      ].filter(Boolean).join(", ");
      const failureReason = `Missing required credential(s): ${missing}`;
      console.error("[MOVVI Reverse Geocoding Diagnostic]", failureReason);
      return emptyGeocode({ ...diagnosticBase, failureReason, rejectionReason: failureReason });
    }

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": connKey,
      },
    });
    console.log("[MOVVI Reverse Geocoding Diagnostic] HTTP response status:", res.status);

    const contentType = res.headers.get("content-type") ?? "";
    let responseBody: unknown;
    if (contentType.includes("application/json")) {
      responseBody = await res.json();
    } else {
      responseBody = await res.text();
    }
    console.log("[MOVVI Reverse Geocoding Diagnostic] complete response body:", stringifyDiagnosticBody(responseBody));

    const json = (typeof responseBody === "object" && responseBody !== null ? responseBody : {}) as {
      status?: string;
      error_message?: string;
      error?: string | { message?: string; status?: string; code?: string };
      results?: GResult[];
    };
    const googleError = json.error_message || (typeof json.error === "string" ? json.error : json.error?.message);
    const googleStatus = json.status || (typeof json.error === "object" ? json.error.status : undefined);
    const rejectionReason = googleError || googleStatus;
    const diagnostic: ReverseGeocodeDiagnostic = {
      ...diagnosticBase,
      httpStatus: res.status,
      responseBody,
      googleStatus,
      googleError,
      rejectionReason,
    };

    if (googleError) {
      console.error("[MOVVI Reverse Geocoding Diagnostic] Google returned error exactly:", googleError);
    }
    if (googleStatus && googleStatus !== "OK") {
      console.error("[MOVVI Reverse Geocoding Diagnostic] Google status:", googleStatus);
    }
    if (!res.ok) {
      const failureReason = googleError || `HTTP ${res.status}`;
      console.error("[MOVVI Reverse Geocoding Diagnostic] API key rejection / gateway failure reason:", failureReason);
      return emptyGeocode({ ...diagnostic, failureReason, rejectionReason: failureReason });
    }
    if (googleStatus && googleStatus !== "OK") {
      const failureReason = googleError || googleStatus;
      console.error("[MOVVI Reverse Geocoding Diagnostic] Geocoding API failure reason:", failureReason);
      return emptyGeocode({ ...diagnostic, failureReason, rejectionReason: failureReason });
    }

    const results = json.results ?? [];
    if (!results.length) {
      const failureReason = "Google returned OK but no geocoding results.";
      console.error("[MOVVI Reverse Geocoding Diagnostic]", failureReason);
      return emptyGeocode({ ...diagnostic, failureReason });
    }

    const top = results[0];
    const address = top.formatted_address ?? "";
    const locationType = top.geometry?.location_type ?? "";
    const partialMatch = !!top.partial_match;
    const plusCode = top.plus_code?.global_code;
    const topTypes = top.types ?? [];


    // Prioridade conforme exigência: sublocality_level_1, sublocality_level_2,
    // neighborhood, locality, administrative_area_level_2, administrative_area_level_1.
    // Para a primeira linha (friendly), só usamos níveis MENORES que o município
    // (povoado / bairro / distrito). Município vai sempre para a segunda linha.
    const povoadoCandidates = [
      ["sublocality_level_1"],
      ["sublocality_level_2"],
      ["sublocality"],
      ["neighborhood"],
      ["administrative_area_level_4"],
      ["administrative_area_level_3"],
    ];
    let povoado: { long: string; short: string } | undefined;
    for (const types of povoadoCandidates) {
      povoado = pick(results, types);
      if (povoado) break;
    }

    const rua = pick(results, ["route"]);
    const numero = pick(results, ["street_number"]);
    const bairro = pick(results, ["neighborhood"]);
    const cidade =
      pick(results, ["locality"]) ?? pick(results, ["administrative_area_level_2"]);
    const estado = pick(results, ["administrative_area_level_1"]);
    const pais = pick(results, ["country"]);

    const components: GeocodeComponents = {
      rua: rua?.long,
      numero: numero?.long,
      povoado: povoado?.long,
      bairro: bairro?.long,
      cidade: cidade?.long,
      estado: estado?.long,
      estadoSigla: estado?.short,
      pais: pais?.long,
    };

    // Friendly = só povoado/bairro. Nunca repetir o município aqui.
    const cityName = cidade?.long?.toLowerCase() ?? "";
    const candidate = povoado?.long ?? bairro?.long ?? "";
    const friendly =
      candidate && candidate.toLowerCase() !== cityName ? candidate : "";

    const region =
      cidade && estado
        ? `${cidade.long} - ${estado.short}`
        : (cidade?.long ?? estado?.long ?? "");

    const approximate = !friendly && !!region;

    // ROOFTOP é o único nível considerado endereço exato no Brasil.
    // RANGE_INTERPOLATED interpola entre números → não confiável para zona rural.
    // GEOMETRIC_CENTER/APPROXIMATE são área/poligono → nunca apresentar como rua exata.
    const precision: "exact" | "approximate" =
      locationType === "ROOFTOP" && !partialMatch ? "exact" : "approximate";

    return {
      address,
      friendly,
      region,
      approximate,
      precision,
      locationType,
      partialMatch,
      plusCode,
      types: topTypes,
      geocodedLat: top.geometry?.location?.lat,
      geocodedLng: top.geometry?.location?.lng,
      components,
      diagnostic,
    };
  });
