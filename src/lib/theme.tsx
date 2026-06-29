import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "movvi.theme";

type ThemeContextValue = {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (m: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

// A aplicação MOVVI é SEMPRE escura (identidade visual da marca).
// O tema do mapa é independente — ver src/lib/mapTheme.tsx.
function resolveTheme(_mode: ThemeMode): ResolvedTheme {
  return "dark";
}

function applyThemeClass(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("light", resolved === "light");
  root.style.colorScheme = resolved;
}

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* noop */
  }
  return "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode());
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(readStoredMode()));

  // Apply on mode change
  useEffect(() => {
    const r = resolveTheme(mode);
    setResolved(r);
    applyThemeClass(r);
  }, [mode]);

  // Listen to system changes while in "system" mode
  useEffect(() => {
    if (mode !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const r: ResolvedTheme = mq.matches ? "dark" : "light";
      setResolved(r);
      applyThemeClass(r);
    };
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, [mode]);

  // Sync from Supabase user preferences on auth/state change
  useEffect(() => {
    let cancelled = false;
    async function syncFromSupabase() {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return;
      const { data: row } = await supabase
        .from("users")
        .select("preferences")
        .eq("auth_user_id", uid)
        .maybeSingle();
      const stored = (row?.preferences as { theme?: ThemeMode } | null)?.theme;
      if (!cancelled && (stored === "light" || stored === "dark" || stored === "system")) {
        try {
          window.localStorage.setItem(STORAGE_KEY, stored);
        } catch {
          /* noop */
        }
        setModeState(stored);
      }
    }
    syncFromSupabase();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "USER_UPDATED") syncFromSupabase();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* noop */
    }
    setModeState(next);
    // Persist to supabase (best-effort, fire-and-forget)
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return;
      const { data: row } = await supabase
        .from("users")
        .select("preferences")
        .eq("auth_user_id", uid)
        .maybeSingle();
      const prefs = { ...((row?.preferences as Record<string, unknown>) ?? {}), theme: next };
      await supabase.from("users").update({ preferences: prefs }).eq("auth_user_id", uid);
    })().catch(() => {
      /* noop */
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Safe fallback when used outside provider (e.g. SSR shells)
    return {
      mode: "dark",
      resolved: "dark",
      setMode: () => {
        /* noop */
      },
    };
  }
  return ctx;
}

/** Inline script content to prevent FOUC — applies stored theme before React hydrates. */
export const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem('${STORAGE_KEY}')||'dark';var d=m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.classList.toggle('light',!d);r.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
