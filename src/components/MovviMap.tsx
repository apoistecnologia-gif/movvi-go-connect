import { useJsApiLoader, GoogleMap } from "@react-google-maps/api";
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_LIBRARIES,
  BRAZIL_CENTER,
  BRAZIL_ZOOM,
  getMapStyleForTheme,
  getMapBackgroundForTheme,
  isBrazilCoordinate,
  purgeForeignMapCache,
} from "@/lib/googleMaps";
import { useTheme } from "@/lib/theme";

interface MovviMapProps {
  center?: { lat: number; lng: number } | null;
  zoom?: number;
  height?: string | number;
  className?: string;
  onLoad?: (map: google.maps.Map) => void;
  children?: ReactNode;
  /** Override theme; defaults to global theme. */
  themeOverride?: "light" | "dark";
}

/**
 * Componente central de mapa do MOVVI DRIVE.
 *
 * - Mapa SEMPRE inicia dentro do Brasil. Coordenadas estrangeiras são ignoradas.
 * - Sem GPS → mostra o Brasil inteiro (zoom 5).
 * - Estilo claro/escuro reativo ao tema global. A troca é aplicada
 *   imperativamente via `map.setOptions({ styles })` para que o mapa
 *   atualize SEM remontar (evita perder centro/GPS/marcadores).
 */
export function MovviMap({
  center,
  zoom,
  height = "100%",
  className,
  onLoad,
  children,
  themeOverride,
}: MovviMapProps) {
  useEffect(() => {
    purgeForeignMapCache();
  }, []);

  const { resolved } = useTheme();
  const theme: "light" | "dark" = themeOverride ?? resolved;

  const { isLoaded, loadError } = useJsApiLoader({
    id: "movvi-google-maps",
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
    language: "pt-BR",
    region: "BR",
  });

  const isValid = !!center && isBrazilCoordinate(center.lat, center.lng);
  const effectiveCenter = isValid ? center! : BRAZIL_CENTER;
  const effectiveZoom = isValid ? (zoom ?? 14) : BRAZIL_ZOOM;
  // Key estável — não inclui tema, para evitar remontar a cada troca.
  const mapKey = isValid ? "valid" : "fallback";

  const containerStyle = useMemo(
    () => ({
      width: "100%",
      height: typeof height === "number" ? `${height}px` : height,
    }),
    [height],
  );

  const styles = useMemo(() => getMapStyleForTheme(theme), [theme]);
  const bgColor = useMemo(() => getMapBackgroundForTheme(theme), [theme]);

  const mapRef = useRef<google.maps.Map | null>(null);

  // Aplica o estilo imperativamente sempre que o tema mudar.
  useEffect(() => {
    if (!mapRef.current) return;
    // eslint-disable-next-line no-console
    console.log("[MovviMap] applying theme", theme, "→", styles.length, "rules");
    mapRef.current.setOptions({ styles, backgroundColor: bgColor });
  }, [theme, styles, bgColor]);

  const handleLoad = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map;
      // eslint-disable-next-line no-console
      console.log("[MovviMap] map loaded — initial theme:", theme);
      map.setOptions({ styles, backgroundColor: bgColor });
      onLoad?.(map);
    },
    [onLoad, styles, bgColor, theme],
  );

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div
        className={`flex items-center justify-center bg-surface text-foreground p-6 text-center ${className ?? ""}`}
        style={containerStyle}
      >
        <p className="text-sm">
          <strong>VITE_GOOGLE_MAPS_API_KEY não encontrada.</strong>
          <br />
          Conecte o Google Maps em Connectors para liberar o mapa.
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        className={`flex items-center justify-center bg-surface text-destructive-foreground bg-destructive/20 p-6 text-center ${className ?? ""}`}
        style={containerStyle}
      >
        <p className="text-sm">
          Falha ao carregar o Google Maps. Verifique sua conexão e a chave de API.
        </p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div
        className={`flex items-center justify-center bg-surface text-muted-foreground ${className ?? ""}`}
        style={containerStyle}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm">Carregando mapa...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={className} style={containerStyle}>
      <GoogleMap
        key={mapKey}
        mapContainerStyle={{ width: "100%", height: "100%" }}
        center={effectiveCenter}
        zoom={effectiveZoom}
        onLoad={handleLoad}
        options={{
          styles,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          clickableIcons: false,
          backgroundColor: bgColor,
          restriction: {
            latLngBounds: { north: 6, south: -34, east: -34, west: -74 },
            strictBounds: false,
          },
        }}
      >
        {children}
      </GoogleMap>
    </div>
  );
}
