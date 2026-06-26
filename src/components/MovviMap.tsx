import { useJsApiLoader, GoogleMap } from "@react-google-maps/api";
import { useEffect, useMemo, type ReactNode } from "react";
import {
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_LIBRARIES,
  BRAZIL_CENTER,
  BRAZIL_ZOOM,
  MOVVI_DARK_MAP_STYLE,
  isBrazilCoordinate,
  purgeForeignMapCache,
} from "@/lib/googleMaps";

interface MovviMapProps {
  center?: { lat: number; lng: number } | null;
  zoom?: number;
  height?: string | number;
  className?: string;
  onLoad?: (map: google.maps.Map) => void;
  children?: ReactNode;
}

/**
 * Componente central de mapa do MOVVI DRIVE.
 *
 * REGRA CRÍTICA:
 *   - O mapa SEMPRE inicia dentro do Brasil. Coordenadas estrangeiras são ignoradas.
 *   - Sem GPS → mostra o Brasil inteiro (zoom 5).
 *   - Quando o GPS chega, re-centraliza apenas se a coordenada for brasileira.
 */
export function MovviMap({
  center,
  zoom,
  height = "100%",
  className,
  onLoad,
  children,
}: MovviMapProps) {
  useEffect(() => {
    purgeForeignMapCache();
  }, []);

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
  // Key dinâmica garante recriação caso o centro precise ser corrigido.
  const mapKey = `map-${effectiveCenter.lat.toFixed(3)}-${effectiveCenter.lng.toFixed(3)}`;

  const containerStyle = useMemo(
    () => ({
      width: "100%",
      height: typeof height === "number" ? `${height}px` : height,
    }),
    [height],
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
        onLoad={onLoad}
        options={{
          styles: MOVVI_DARK_MAP_STYLE,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          clickableIcons: false,
          backgroundColor: "#121826",
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
