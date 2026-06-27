import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

type SettingsMap = Record<string, unknown>;

let _cache: SettingsMap | null = null;
const _listeners = new Set<(s: SettingsMap) => void>();
let _channel: ReturnType<typeof supabase.channel> | null = null;

async function loadAll(): Promise<SettingsMap> {
  const { data, error } = await supabase.from("app_settings").select("key,value");
  if (error) {
    console.warn("[MOVVI] app_settings load:", error.message);
    return {};
  }
  const map: SettingsMap = {};
  for (const row of data ?? []) map[row.key] = row.value;
  return map;
}

function ensureChannel() {
  if (_channel) return;
  _channel = supabase
    .channel("app_settings_global")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "app_settings" },
      async () => {
        _cache = await loadAll();
        _listeners.forEach((l) => l(_cache!));
      },
    )
    .subscribe();
}

export function useAppSettings() {
  const [settings, setSettings] = useState<SettingsMap>(_cache ?? {});
  const [loading, setLoading] = useState(!_cache);

  useEffect(() => {
    let alive = true;
    ensureChannel();
    if (!_cache) {
      loadAll().then((m) => {
        _cache = m;
        if (alive) {
          setSettings(m);
          setLoading(false);
        }
      });
    }
    const listener = (m: SettingsMap) => alive && setSettings(m);
    _listeners.add(listener);
    return () => {
      alive = false;
      _listeners.delete(listener);
    };
  }, []);

  const get = useCallback(
    <T = unknown,>(key: string, fallback?: T): T =>
      (settings[key] as T) ?? (fallback as T),
    [settings],
  );

  return { settings, get, loading };
}

export function useAppSetting<T = unknown>(key: string, fallback?: T) {
  const { get, loading } = useAppSettings();
  return { value: get<T>(key, fallback), loading };
}
