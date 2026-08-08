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

export async function startNativeDriverLocation(): Promise<boolean> {
  if (!isNativeAndroidDriverLocation()) return false;

  let { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return false;

  const expiresSoon =
    typeof data.session.expires_at === "number" && data.session.expires_at * 1000 < Date.now() + 120_000;
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
