// Chave do Google Maps fornecida pelo conector Lovable (referrer-restricted: *.lovable.app).
export const GOOGLE_MAPS_API_KEY =
  (import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined) ?? "";

// Bibliotecas que usamos no app inteiro. Manter referência estável para evitar reload do script.
export const GOOGLE_MAPS_LIBRARIES = ["places", "routes", "geometry", "marker", "visualization"] as unknown as (
  | "places"
  | "geometry"
  | "drawing"
  | "visualization"
)[];

// ─── COORDENADAS PERMITIDAS (somente Brasil) ─────────────────────────────
// Centro geográfico do Brasil — usado quando o GPS ainda não respondeu.
export const BRAZIL_CENTER = { lat: -14.235, lng: -51.9253 };
export const BRAZIL_ZOOM = 5;

// Alias legado — apontado para o centro geográfico do Brasil. Não representa
// uma cidade específica; usado apenas como enquadramento inicial do mapa
// enquanto a localização real do usuário (GPS / Geocoding / entrada manual)
// ainda não chegou.
export const BRASILIA_CENTER = BRAZIL_CENTER;

// Bounding box aproximado do território brasileiro.
export function isBrazilCoordinate(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -34 &&
    lat <= 6 &&
    lng >= -74 &&
    lng <= -34
  );
}

// Devolve a coordenada se for brasileira; caso contrário, devolve o centro do Brasil.
export function sanitizeBrazilCenter(c?: { lat: number; lng: number } | null) {
  if (!c || !isBrazilCoordinate(c.lat, c.lng)) {
    if (c) {
      // eslint-disable-next-line no-console
      console.warn("[MOVVI] Coordenada fora do Brasil ignorada:", c);
    }
    return BRAZIL_CENTER;
  }
  return c;
}

// Limpa qualquer coordenada/cache de mapa antigos persistidos no navegador.
export function purgeForeignMapCache() {
  if (typeof window === "undefined") return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      if (/map|center|coords|gmaps|google|movvi\.map/i.test(k)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => {
      try {
        const raw = window.localStorage.getItem(k);
        if (!raw) return;
        // Tenta interpretar como coordenada — se contiver lat/lng fora do Brasil, remove.
        const parsed = JSON.parse(raw);
        const lat = parsed?.lat ?? parsed?.center?.lat;
        const lng = parsed?.lng ?? parsed?.center?.lng;
        if (typeof lat === "number" && typeof lng === "number" && !isBrazilCoordinate(lat, lng)) {
          window.localStorage.removeItem(k);
        }
      } catch {
        // Se não for JSON mas a chave parece coordenada do mapa, remove por segurança.
        if (/center|coords|gmaps/i.test(k)) window.localStorage.removeItem(k);
      }
    });
  } catch {
    /* ignore */
  }
}

// Estilo escuro do mapa, alinhado com a identidade MOVVI.
export const MOVVI_DARK_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#121826" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#05070D" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9aa3b2" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "off" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1c2436" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#0d111c" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#6b7280" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#283149" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a1626" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4a5a73" }] },
];

// Estilo claro premium — inspirado em apps de mobilidade comerciais (Uber/99).
// Fundo neutro, ruas em cinza suave, parques em verde claro, água em azul claro.
export const MOVVI_LIGHT_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#f4f5f7" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#5b6470" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.neighborhood", stylers: [{ visibility: "off" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#dff0d3" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6b8a5a" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#e6e8ec" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#7a8392" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#ffe9b3" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#f2cf7a" }] },
  { featureType: "road.local", elementType: "labels", stylers: [{ visibility: "simplified" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#cfe4f5" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#5b8bb3" }] },
];

export function getMapStyleForTheme(
  theme: "light" | "dark",
): google.maps.MapTypeStyle[] {
  return theme === "light" ? MOVVI_LIGHT_MAP_STYLE : MOVVI_DARK_MAP_STYLE;
}

export function getMapBackgroundForTheme(theme: "light" | "dark"): string {
  return theme === "light" ? "#f4f5f7" : "#121826";
}


// ─── Helpers seguros para uso ANTES de o SDK terminar de carregar ─────────
// O JSX pai de <MovviMap> é avaliado em todo render, mesmo enquanto
// `isLoaded` ainda é falso. Acessar `google.maps.Point` / `SymbolPath`
// diretamente nesses pontos lança "google is not defined" /
// "google.maps.Point is not a constructor". Use os helpers abaixo para
// construir ícones de forma resiliente — eles devolvem `undefined` quando
// o SDK ainda não está pronto e o Marker simplesmente cai no ícone padrão
// no primeiro render; assim que o SDK carrega e o componente re-renderiza,
// o ícone correto aparece.

export function isGoogleMapsReady(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as unknown as { google?: { maps?: { Point?: unknown } } }).google
      ?.maps?.Point === "function"
  );
}

export function safePoint(x: number, y: number): google.maps.Point | undefined {
  return isGoogleMapsReady() ? new google.maps.Point(x, y) : undefined;
}

// SymbolPath é um enum numérico. CIRCLE === 0, FORWARD_CLOSED_ARROW === 1,
// BACKWARD_CLOSED_ARROW === 2. Devolvemos o valor numérico quando o SDK
// ainda não respondeu para que `icon.path` continue válido.
const SYMBOL_PATH_FALLBACK: Record<string, number> = {
  CIRCLE: 0,
  FORWARD_CLOSED_ARROW: 1,
  BACKWARD_CLOSED_ARROW: 2,
  FORWARD_OPEN_ARROW: 3,
  BACKWARD_OPEN_ARROW: 4,
};

export function safeSymbol(
  name: keyof typeof google.maps.SymbolPath,
): google.maps.SymbolPath | number {
  if (isGoogleMapsReady() && google.maps.SymbolPath) {
    return google.maps.SymbolPath[name];
  }
  return SYMBOL_PATH_FALLBACK[name as string] ?? 0;
}
