import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Tema do Google Map — INDEPENDENTE do tema da aplicação.
 *
 * A aplicação MOVVI permanece sempre no tema escuro de marca.
 * O mapa pode ser alternado entre claro / escuro / automático
 * (claro entre 06:00 e 18:00, escuro fora desse intervalo).
 *
 * Padrão MOVVI: Interface escura + Mapa claro premium.
 */
export type MapThemeMode = "light" | "dark" | "auto";
export type ResolvedMapTheme = "light" | "dark";

const STORAGE_KEY = "movvi.map.theme";

function readStored(): MapThemeMode {
  if (typeof window === "undefined") return "light";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "auto") return v;
  } catch {
    /* noop */
  }
  return "light";
}

function resolveByClock(): ResolvedMapTheme {
  const h = new Date().getHours();
  return h >= 6 && h < 18 ? "light" : "dark";
}

function resolve(mode: MapThemeMode): ResolvedMapTheme {
  return mode === "auto" ? resolveByClock() : mode;
}

type Ctx = {
  mode: MapThemeMode;
  resolved: ResolvedMapTheme;
  setMode: (m: MapThemeMode) => void;
};

const MapThemeContext = createContext<Ctx | null>(null);

export function MapThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<MapThemeMode>(() => readStored());
  const [resolved, setResolved] = useState<ResolvedMapTheme>(() => resolve(readStored()));

  useEffect(() => {
    setResolved(resolve(mode));
    if (mode !== "auto") return;
    // Re-checa a cada 5 minutos quando em "auto".
    const id = window.setInterval(() => setResolved(resolveByClock()), 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [mode]);

  const setMode = useCallback((next: MapThemeMode) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* noop */
    }
    setModeState(next);
  }, []);

  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved, setMode]);

  return <MapThemeContext.Provider value={value}>{children}</MapThemeContext.Provider>;
}

export function useMapTheme(): Ctx {
  const ctx = useContext(MapThemeContext);
  if (!ctx) {
    return {
      mode: "light",
      resolved: "light",
      setMode: () => {
        /* noop */
      },
    };
  }
  return ctx;
}
