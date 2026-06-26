import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

export type GeocodeComponents = {
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
  components: GeocodeComponents;
};

type GResult = {
  formatted_address?: string;
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

export const reverseGeocode = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<GeocodeResult> => {
    const empty: GeocodeResult = {
      address: "",
      friendly: "",
      region: "",
      approximate: false,
      components: {},
    };
    const lovableKey = process.env.LOVABLE_API_KEY;
    const connKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!lovableKey || !connKey) return empty;

    const url = `${GATEWAY_URL}/maps/api/geocode/json?latlng=${data.lat},${data.lng}&language=pt-BR&region=br`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": connKey,
      },
    });
    if (!res.ok) return empty;
    const json = (await res.json()) as { results?: GResult[] };
    const results = json.results ?? [];
    if (!results.length) return empty;

    const address = results[0].formatted_address ?? "";

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

    const bairro = pick(results, ["neighborhood"]);
    const cidade =
      pick(results, ["locality"]) ?? pick(results, ["administrative_area_level_2"]);
    const estado = pick(results, ["administrative_area_level_1"]);
    const pais = pick(results, ["country"]);

    const components: GeocodeComponents = {
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

    return { address, friendly, region, approximate, components };
  });
