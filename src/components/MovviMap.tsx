import { useJsApiLoader, GoogleMap } from "@react-google-maps/api";
import { useMemo, type ReactNode } from "react";
import {
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_LIBRARIES,
  BRASILIA_CENTER,
  MOVVI_DARK_MAP_STYLE,
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
 *   O mapa SEMPRE renderiza. Se `center` for null/undefined, usa Brasília
 *   como fallback temporário e re-centraliza quando GPS real carregar.
 *   Nunca retornamos null por falta de localização.
 */
export function MovviMap({
  center,
  zoom = 14,
  height = "100%",
  className,
  onLoad,
  children,
}: MovviMapProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: "movvi-google-maps",
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
    language: "pt-BR",
    region: "BR",
  });

  const effectiveCenter = useMemo(
    () => center ?? BRASILIA_CENTER,
    [center],
  );

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
        mapContainerStyle={{ width: "100%", height: "100%" }}
        center={effectiveCenter}
        zoom={zoom}
        onLoad={onLoad}
        options={{
          styles: MOVVI_DARK_MAP_STYLE,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          clickableIcons: false,
          backgroundColor: "#121826",
        }}
      >
        {children}
      </GoogleMap>
    </div>
  );
}
