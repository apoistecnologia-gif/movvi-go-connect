import { Capacitor, registerPlugin } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

type StartResult = { started?: boolean };
type StopResult = { stopped?: boolean };

interface DriverLocationPlugin {
  start(options: {
    supabaseUrl: string;
    publishableKey: string;
    accessToken: string;
    refreshToken: string;
  }): Promise<StartResult>;
  stop(): Promise<StopResult>;
}

const DriverLocation = registerPlugin<DriverLocationPlugin>("DriverLocation");

export function isNativeAndroidDriverLocation(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

async function ensureForegroundLocationPermission(): Promise<boolean> {
  const { Geolocation } = await import("@capacitor/geolocation");
  let permission = await Geolocation.checkPermissions();
  const alreadyGranted =
    permission.location === "granted" || permission.coarseLocation === "granted";
  if (alreadyGranted) return true;

  if (
    permission.location === "prompt" ||
    permission.location === "prompt-with-rationale" ||
    permission.coarseLocation === "prompt" ||
    permission.coarseLocation === "prompt-with-rationale"
  ) {
    permission = await Geolocation.requestPermissions({ permissions: ["location"] });
  }

  return permission.location === "granted" || permission.coarseLocation === "granted";
}

export async function startNativeDriverLocation(): Promise<boolean> {
  if (!isNativeAndroidDriverLocation()) return false;

  // Não inicia o Foreground Service enquanto o diálogo de permissão ainda está
  // pendente. Sem isso, o Android pode encerrar o serviço e o JS acreditar que
  // o GPS continua ativo.
  const permissionGranted = await ensureForegroundLocationPermission();
  if (!permissionGranted) return false;

  const sessionResult = await supabase.auth.getSession();
  let data = sessionResult.data;
  const error = sessionResult.error;
  if (error || !data.session) return false;

  const expiresSoon =
    typeof data.session.expires_at === "number" &&
    data.session.expires_at * 1000 < Date.now() + 120_000;
  if (expiresSoon) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session) return false;
    data = { session: refreshed.data.session };
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  if (!supabaseUrl || !publishableKey) return false;

  const result = await DriverLocation.start({
    supabaseUrl,
    publishableKey,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  });
  return result.started === true;
}

export async function stopNativeDriverLocation(): Promise<void> {
  if (!isNativeAndroidDriverLocation()) return;
  await DriverLocation.stop();
}
