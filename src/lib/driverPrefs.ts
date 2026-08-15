// APOIS — preferências do motorista persistidas em Supabase + cache local.
import { supabase } from "@/integrations/supabase/client";

export type DriverPrefs = {
  push: boolean;
  ride_alerts: boolean;
  sound: boolean;
  vibration: boolean;
  accept_short: boolean;
  accept_long: boolean;
  max_radius_km: number;
  accept_cash: boolean;
  accept_pix: boolean;
  accept_card: boolean;
  theme: "light" | "dark" | "system";
  language: "pt" | "en" | "es";
  navigation_app: "internal" | "google" | "waze";
};

export const DEFAULT_DRIVER_PREFS: DriverPrefs = {
  push: true,
  ride_alerts: true,
  sound: true,
  vibration: true,
  accept_short: true,
  accept_long: true,
  max_radius_km: 10,
  accept_cash: true,
  accept_pix: true,
  accept_card: false,
  theme: "system",
  language: "pt",
  navigation_app: "internal",
};

const CACHE_KEY = (uid: string) => `movvi:driver:prefs:${uid}`;

export async function loadDriverPrefs(userId: string): Promise<DriverPrefs> {
  // cache primeiro p/ render instantâneo
  try {
    const cached = localStorage.getItem(CACHE_KEY(userId));
    if (cached) {
      const parsed = { ...DEFAULT_DRIVER_PREFS, ...JSON.parse(cached) };
      // refresh em background
      void refreshFromDb(userId);
      return parsed;
    }
  } catch {}
  return refreshFromDb(userId);
}

async function refreshFromDb(userId: string): Promise<DriverPrefs> {
  const { data, error } = await supabase
    .from("driver_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (import.meta.env.DEV) console.warn("[APOIS PREFS] load erro:", error.message);
    return DEFAULT_DRIVER_PREFS;
  }
  if (!data) {
    // cria default
    await supabase
      .from("driver_preferences")
      .insert({ user_id: userId, ...DEFAULT_DRIVER_PREFS });
    localStorage.setItem(CACHE_KEY(userId), JSON.stringify(DEFAULT_DRIVER_PREFS));
    return DEFAULT_DRIVER_PREFS;
  }
  const prefs: DriverPrefs = {
    push: data.push,
    ride_alerts: data.ride_alerts,
    sound: data.sound,
    vibration: data.vibration,
    accept_short: data.accept_short,
    accept_long: data.accept_long,
    max_radius_km: data.max_radius_km,
    accept_cash: data.accept_cash,
    accept_pix: data.accept_pix,
    accept_card: data.accept_card,
    theme: data.theme as DriverPrefs["theme"],
    language: data.language as DriverPrefs["language"],
    navigation_app: data.navigation_app as DriverPrefs["navigation_app"],
  };
  localStorage.setItem(CACHE_KEY(userId), JSON.stringify(prefs));
  return prefs;
}

export async function saveDriverPrefs(userId: string, prefs: DriverPrefs) {
  localStorage.setItem(CACHE_KEY(userId), JSON.stringify(prefs));
  const { error } = await supabase
    .from("driver_preferences")
    .upsert({ user_id: userId, ...prefs }, { onConflict: "user_id" });
  if (error) throw error;
}

export function openNavigationApp(
  app: DriverPrefs["navigation_app"],
  origin: { lat: number; lng: number } | null,
  destination: { lat: number; lng: number },
) {
  const d = `${destination.lat},${destination.lng}`;
  if (app === "waze") {
    window.open(`https://www.waze.com/ul?ll=${d}&navigate=yes`, "_blank");
    return;
  }
  if (app === "google") {
    const o = origin ? `&origin=${origin.lat},${origin.lng}` : "";
    window.open(
      `https://www.google.com/maps/dir/?api=1${o}&destination=${d}&travelmode=driving`,
      "_blank",
    );
    return;
  }
  // interno → não abre nada
}
