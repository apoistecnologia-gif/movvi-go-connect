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

export type GeocodeConfidence = "exact" | "approximate" | "area" | "fallback";

export type GeocodeResult = {
  address: string;
  friendly: string;
  region: string;
  approximate: boolean;
  precision: "exact" | "approximate";
  /** Nova classificação detalhada da seleção do melhor resultado. */
  confidence: GeocodeConfidence;
  /** Motivo legível pelo qual o melhor resultado foi escolhido. */
  selectionReason: string;
  locationType: string;
  partialMatch: boolean;
  plusCode?: string;
  types: string[];
  geocodedLat?: number;
  geocodedLng?: number;
  components: GeocodeComponents;
  /** Nome de um POI próximo (≤200m), quando a rua não estiver nomeada. */
  nearestPoi?: string;
  /** Rótulo final pronto para exibição (regra MOVVI BR, nunca "Unnamed Road"). */
  pickupLabel?: string;
  /** Sub-rótulo (município/estado), pode ser igual a region. */
  pickupSubLabel?: string;
  diagnostic?: ReverseGeocodeDiagnostic;
};

export type ReverseGeocodeDiagnostic = {
  latitude: number;
  longitude: number;
  requestUrl: string;
  httpStatus: number | null;
  responseBody: string | null;
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
    confidence: "fallback",
    selectionReason: "No usable result from Google Geocoding",
    locationType: "",
    partialMatch: false,
    types: [],
    components: {},
    diagnostic,
  };
}

function hasComponent(r: GResult, type: string): boolean {
  return (r.address_components ?? []).some((c) => c.types.includes(type));
}

function hasAnyComponent(r: GResult, types: string[]): boolean {
  return types.some((t) => hasComponent(r, t));
}

export function selectBestGeocodeResult(
  results: GResult[],
): { result: GResult; index: number; confidence: GeocodeConfidence; reason: string } | null {
  if (!results.length) return null;

  // Priority A: ROOFTOP with route/neighborhood/locality
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (
      r.geometry?.location_type === "ROOFTOP" &&
      hasAnyComponent(r, ["route", "neighborhood", "locality"])
    ) {
      return { result: r, index: i, confidence: "exact", reason: "ROOFTOP with route/neighborhood/locality" };
    }
  }
  // Priority B: RANGE_INTERPOLATED with route/neighborhood/locality
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (
      r.geometry?.location_type === "RANGE_INTERPOLATED" &&
      hasAnyComponent(r, ["route", "neighborhood", "locality"])
    ) {
      return { result: r, index: i, confidence: "approximate", reason: "RANGE_INTERPOLATED with route/neighborhood/locality" };
    }
  }
  // Priority C: GEOMETRIC_CENTER with usable area
  const areaTypes = [
    "neighborhood",
    "locality",
    "sublocality",
    "sublocality_level_1",
    "sublocality_level_2",
    "administrative_area_level_2",
    "administrative_area_level_3",
    "administrative_area_level_4",
  ];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (
      r.geometry?.location_type === "GEOMETRIC_CENTER" &&
      (hasAnyComponent(r, areaTypes) || !!r.formatted_address)
    ) {
      return { result: r, index: i, confidence: "area", reason: "GEOMETRIC_CENTER with usable area or formatted_address" };
    }
  }
  // Priority D: fallback - first result with formatted_address
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.formatted_address) {
      return { result: r, index: i, confidence: "fallback", reason: "Fallback to first result with formatted_address" };
    }
  }
  return { result: results[0], index: 0, confidence: "fallback", reason: "Last-resort: first result without formatted_address" };
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

    const responseBody = await res.text();
    console.log("[MOVVI Reverse Geocoding Diagnostic] complete response body:", responseBody);

    let parsedBody: unknown = {};
    try {
      parsedBody = responseBody ? JSON.parse(responseBody) : {};
    } catch (parseError) {
      console.error("[MOVVI Reverse Geocoding Diagnostic] Failed to parse response body as JSON:", parseError);
    }

    const json = (typeof parsedBody === "object" && parsedBody !== null ? parsedBody : {}) as {
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

    const selection = selectBestGeocodeResult(results);
    const top = selection?.result ?? results[0];
    const confidence: GeocodeConfidence = selection?.confidence ?? "fallback";
    const selectionReason = selection?.reason ?? "No selection produced; using first result";

    console.log("[MOVVI Reverse Geocoding Diagnostic] total results:", results.length);
    console.log("[MOVVI Reverse Geocoding Diagnostic] selected index:", selection?.index ?? 0);
    console.log("[MOVVI Reverse Geocoding Diagnostic] selected formatted_address:", top.formatted_address ?? "(none)");
    console.log("[MOVVI Reverse Geocoding Diagnostic] selected location_type:", top.geometry?.location_type ?? "(none)");
    console.log("[MOVVI Reverse Geocoding Diagnostic] confidence:", confidence);
    console.log("[MOVVI Reverse Geocoding Diagnostic] reason:", selectionReason);

    const address = top.formatted_address ?? "";
    const locationType = top.geometry?.location_type ?? "";
    const partialMatch = !!top.partial_match;
    const plusCode = top.plus_code?.global_code;
    const topTypes = top.types ?? [];

    // Para extração de componentes, priorize o resultado selecionado, com fallback
    // para a lista completa (Google retorna componentes redundantes entre resultados).
    const orderedResults = [top, ...results.filter((r) => r !== top)];

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
      povoado = pick(orderedResults, types);
      if (povoado) break;
    }

    const ruaRaw = pick(orderedResults, ["route"]);
    const rua = isUnnamedRoad(ruaRaw?.long) ? undefined : ruaRaw;
    const numero = pick(orderedResults, ["street_number"]);
    const bairro = pick(orderedResults, ["neighborhood"]);
    const cidade =
      pick(orderedResults, ["locality"]) ?? pick(orderedResults, ["administrative_area_level_2"]);
    const estado = pick(orderedResults, ["administrative_area_level_1"]);
    const pais = pick(orderedResults, ["country"]);

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

    const cityName = cidade?.long?.toLowerCase() ?? "";
    const candidate = povoado?.long ?? bairro?.long ?? "";
    const friendly =
      candidate && candidate.toLowerCase() !== cityName ? candidate : "";

    const region =
      cidade && estado
        ? `${cidade.long} - ${estado.short}`
        : (cidade?.long ?? estado?.long ?? "");

    const approximate = confidence !== "exact";

    const precision: "exact" | "approximate" = confidence === "exact" ? "exact" : "approximate";

    // POI lookup: rural / sem rua nomeada → tentar Places Nearby
    let nearestPoi: string | undefined;
    if (!rua?.long) {
      try {
        nearestPoi = await fetchNearestPoi(data.lat, data.lng, lovableKey, connKey);
      } catch (err) {
        console.warn("[MOVVI Pickup Label] Nearby POI lookup failed:", err);
      }
    }

    const { pickupLabel, pickupSubLabel } = buildPickupLabel({
      components,
      region,
      nearestPoi,
      hasNamedStreet: !!rua?.long,
    });

    return {
      address,
      friendly,
      region,
      approximate,
      precision,
      confidence,
      selectionReason,
      locationType,
      partialMatch,
      plusCode,
      types: topTypes,
      geocodedLat: top.geometry?.location?.lat,
      geocodedLng: top.geometry?.location?.lng,
      components,
      nearestPoi,
      pickupLabel,
      pickupSubLabel,
      diagnostic,
    };
  });

function isUnnamedRoad(name?: string | null): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  return (
    n === "unnamed road" ||
    n === "estrada sem nome" ||
    n === "rua sem nome" ||
    n === "via sem nome"
  );
}

function buildPickupLabel(args: {
  components: GeocodeComponents;
  region: string;
  nearestPoi?: string;
  hasNamedStreet: boolean;
}): { pickupLabel?: string; pickupSubLabel?: string } {
  const { components, region, nearestPoi, hasNamedStreet } = args;
  const { rua, numero, bairro, povoado, cidade, estado, estadoSigla } = components;

  // Sub-label padrão (município/estado).
  const sub =
    cidade && estadoSigla
      ? `${cidade} - ${estadoSigla}`
      : region || cidade || estado || "";

  // 1) POI próximo tem prioridade quando não há rua nomeada.
  if (!hasNamedStreet && nearestPoi) {
    return { pickupLabel: `Próximo a ${nearestPoi}`, pickupSubLabel: sub };
  }

  // 2) Rua nomeada (com ou sem número).
  if (hasNamedStreet && rua) {
    const main = numero ? `${rua}, ${numero}` : rua;
    return { pickupLabel: main, pickupSubLabel: [bairro, sub].filter(Boolean).join(" • ") };
  }

  // 3) Cadeia de fallback descritiva.
  const fallback = bairro || povoado || cidade || estado;
  if (fallback) {
    return { pickupLabel: fallback, pickupSubLabel: sub && sub !== fallback ? sub : "" };
  }

  // 4) Zona Rural + município.
  if (cidade || estado) {
    return {
      pickupLabel: "Zona Rural",
      pickupSubLabel: sub,
    };
  }

  return { pickupLabel: undefined, pickupSubLabel: undefined };
}

async function fetchNearestPoi(
  lat: number,
  lng: number,
  lovableKey: string,
  connKey: string,
): Promise<string | undefined> {
  const url = `${GATEWAY_URL}/places/v1/places:searchNearby`;
  const body = {
    maxResultCount: 5,
    languageCode: "pt-BR",
    regionCode: "BR",
    rankPreference: "DISTANCE",
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: 200,
      },
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connKey,
      "Content-Type": "application/json",
      "X-Goog-FieldMask": "places.displayName,places.primaryType,places.types",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return undefined;
  const json = (await res.json()) as {
    places?: Array<{
      displayName?: { text?: string };
      primaryType?: string;
      types?: string[];
    }>;
  };
  const places = json.places ?? [];
  // Ignorar tipos genéricos pouco úteis como rótulo.
  const skipTypes = new Set([
    "route",
    "street_address",
    "geocode",
    "political",
    "locality",
    "neighborhood",
    "plus_code",
  ]);
  for (const p of places) {
    const name = p.displayName?.text?.trim();
    if (!name) continue;
    const types = p.types ?? [];
    if (types.every((t) => skipTypes.has(t))) continue;
    return name;
  }
  return undefined;
}

