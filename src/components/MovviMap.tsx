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
import { useMapTheme } from "@/lib/mapTheme";
import { APP_ROLE } from "@/lib/appRole";

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

type ApoisMapWindow = Window & { __apoisMovviMap?: google.maps.Map | null };

function safeMapHeight(height: string | number) {
  if (typeof height === "number") {
    return Number.isFinite(height) && height > 0 ? `${Math.max(120, Math.round(height))}px` : "100%";
  }
  const trimmed = height.trim();
  return trimmed || "100%";
}

function safeZoom(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(20, Math.max(3, Math.round(value)))
    : fallback;
}

/** Componente central de mapa do APOIS. */
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

  const { resolved } = useMapTheme();
  const isDriverRole = APP_ROLE === "driver";
  const theme: "light" | "dark" = themeOverride ?? (isDriverRole ? "dark" : resolved);

  const { isLoaded, loadError } = useJsApiLoader({
    id: "movvi-google-maps",
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
    language: "pt-BR",
    region: "BR",
  });

  const isValid = Boolean(center && isBrazilCoordinate(center.lat, center.lng));
  const effectiveCenter = isValid && center ? center : BRAZIL_CENTER;
  const effectiveZoom = isValid ? safeZoom(zoom, 14) : safeZoom(BRAZIL_ZOOM, 5);

  const containerStyle = useMemo(
    () => ({ width: "100%", height: safeMapHeight(height), minHeight: 0 }),
    [height],
  );

  const styles = useMemo(() => getMapStyleForTheme(theme), [theme]);
  const bgColor = useMemo(() => getMapBackgroundForTheme(theme), [theme]);
  const mapRef = useRef<google.maps.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;
    if (import.meta.env.DEV) console.log("[MovviMap] applying theme", theme, "→", styles.length, "rules");
    mapRef.current.setOptions({ styles, backgroundColor: bgColor });
  }, [theme, styles, bgColor]);

  const handleLoad = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map;
      if (typeof window !== "undefined") (window as ApoisMapWindow).__apoisMovviMap = map;
      if (import.meta.env.DEV) console.log("[MovviMap] map loaded — initial theme:", theme);
      map.setOptions({ styles, backgroundColor: bgColor });
      try {
        onLoad?.(map);
      } catch (error) {
        if (import.meta.env.DEV) console.warn("[MovviMap] callback onLoad falhou", error);
      }
    },
    [onLoad, styles, bgColor, theme],
  );

  const handleUnmount = useCallback((map: google.maps.Map) => {
    if (typeof window !== "undefined") {
      const appWindow = window as ApoisMapWindow;
      if (appWindow.__apoisMovviMap === map) appWindow.__apoisMovviMap = null;
    }
    if (mapRef.current === map) mapRef.current = null;
  }, []);

  const shellClass = `min-w-0 overflow-hidden ${className ?? ""}`;

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className={`flex items-center justify-center bg-surface p-6 text-center text-foreground ${shellClass}`} style={containerStyle} role="alert">
        <p className="max-w-sm break-words text-sm leading-5">
          O mapa está temporariamente indisponível. Tente novamente mais tarde.
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={`flex items-center justify-center bg-surface p-6 text-center ${shellClass}`} style={containerStyle} role="alert" aria-live="assertive">
        <div className="max-w-sm space-y-3">
          <p className="break-words text-sm font-medium leading-5 text-destructive">
            Não foi possível carregar o mapa. Verifique sua conexão e tente novamente.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className={`flex items-center justify-center bg-surface text-muted-foreground ${shellClass}`} style={containerStyle} role="status" aria-live="polite" aria-label="Carregando mapa">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent motion-reduce:animate-none" aria-hidden="true" />
          <p className="text-sm">Carregando mapa…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass} style={containerStyle} aria-label="Mapa APOIS">
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "100%" }}
        center={effectiveCenter}
        zoom={effectiveZoom}
        onLoad={handleLoad}
        onUnmount={handleUnmount}
        options={{
          styles,
          disableDefaultUI: true,
          zoomControl: !isDriverRole,
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
