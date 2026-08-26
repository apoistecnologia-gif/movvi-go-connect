// APOIS — preferências locais do aplicativo do motorista.
//
// Preferências que alteram regras operacionais de despacho/pagamento não
// pertencem aqui: elas só podem ser oferecidas quando houver contrato de
// backend que realmente as aplique. Este módulo persiste apenas opções de UX
// no dispositivo, sem inventar uma tabela remota que não existe no schema.

export type DriverPrefs = {
  push: boolean;
  ride_alerts: boolean;
  sound: boolean;
  vibration: boolean;
  theme: "light" | "dark" | "system";
  language: "pt" | "en" | "es";
  navigation_app: "internal" | "google" | "waze";
};

export const DEFAULT_DRIVER_PREFS: DriverPrefs = {
  push: true,
  ride_alerts: true,
  sound: true,
  vibration: true,
  theme: "system",
  language: "pt",
  navigation_app: "internal",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CACHE_KEY = (uid: string) => `apois:driver:prefs:${UUID_RE.test(uid.trim()) ? uid.trim() : "anonymous"}`;

function isTheme(value: unknown): value is DriverPrefs["theme"] {
  return value === "light" || value === "dark" || value === "system";
}

function isLanguage(value: unknown): value is DriverPrefs["language"] {
  return value === "pt" || value === "en" || value === "es";
}

function isNavigationApp(value: unknown): value is DriverPrefs["navigation_app"] {
  return value === "internal" || value === "google" || value === "waze";
}

function sanitizePrefs(value: unknown): DriverPrefs {
  if (!value || typeof value !== "object") return DEFAULT_DRIVER_PREFS;
  const raw = value as Partial<Record<keyof DriverPrefs, unknown>>;
  return {
    push: typeof raw.push === "boolean" ? raw.push : DEFAULT_DRIVER_PREFS.push,
    ride_alerts: typeof raw.ride_alerts === "boolean" ? raw.ride_alerts : DEFAULT_DRIVER_PREFS.ride_alerts,
    sound: typeof raw.sound === "boolean" ? raw.sound : DEFAULT_DRIVER_PREFS.sound,
    vibration: typeof raw.vibration === "boolean" ? raw.vibration : DEFAULT_DRIVER_PREFS.vibration,
    theme: isTheme(raw.theme) ? raw.theme : DEFAULT_DRIVER_PREFS.theme,
    language: isLanguage(raw.language) ? raw.language : DEFAULT_DRIVER_PREFS.language,
    navigation_app: isNavigationApp(raw.navigation_app) ? raw.navigation_app : DEFAULT_DRIVER_PREFS.navigation_app,
  };
}

function validCoordinate(value: { lat: number; lng: number } | null | undefined): value is { lat: number; lng: number } {
  return Boolean(
    value &&
      Number.isFinite(value.lat) &&
      Number.isFinite(value.lng) &&
      value.lat >= -90 &&
      value.lat <= 90 &&
      value.lng >= -180 &&
      value.lng <= 180,
  );
}

function openExternal(url: string) {
  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (popup) popup.opener = null;
}

export async function loadDriverPrefs(userId: string): Promise<DriverPrefs> {
  try {
    const cached = localStorage.getItem(CACHE_KEY(userId));
    if (!cached) return DEFAULT_DRIVER_PREFS;
    return sanitizePrefs(JSON.parse(cached));
  } catch {
    return DEFAULT_DRIVER_PREFS;
  }
}

export async function saveDriverPrefs(userId: string, prefs: DriverPrefs): Promise<void> {
  const normalizedUserId = userId.trim();
  if (!UUID_RE.test(normalizedUserId)) throw new Error("Não foi possível identificar a conta para salvar as configurações.");
  const normalized = sanitizePrefs(prefs);
  try {
    localStorage.setItem(CACHE_KEY(normalizedUserId), JSON.stringify(normalized));
  } catch {
    throw new Error("Não foi possível salvar as configurações neste dispositivo.");
  }
}

export function openNavigationApp(
  app: DriverPrefs["navigation_app"],
  origin: { lat: number; lng: number } | null,
  destination: { lat: number; lng: number },
) {
  if (app === "internal") return;
  if (!validCoordinate(destination)) throw new Error("navigation_destination_invalid");

  const destinationValue = `${destination.lat},${destination.lng}`;
  if (app === "waze") {
    openExternal(`https://www.waze.com/ul?ll=${encodeURIComponent(destinationValue)}&navigate=yes`);
    return;
  }

  if (app === "google") {
    const params = new URLSearchParams({
      api: "1",
      destination: destinationValue,
      travelmode: "driving",
    });
    if (validCoordinate(origin)) params.set("origin", `${origin.lat},${origin.lng}`);
    openExternal(`https://www.google.com/maps/dir/?${params.toString()}`);
  }
}
