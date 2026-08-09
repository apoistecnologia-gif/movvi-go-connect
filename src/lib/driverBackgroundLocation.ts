import { registerPlugin } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { isNative } from "@/lib/nativeBridge";

type DriverLocationStartOptions = {
  supabaseUrl: string;
  publishableKey: string;
  accessToken: string;
  refreshToken: string;
};

type DriverLocationPlugin = {
  start(options: DriverLocationStartOptions): Promise<{ started: boolean }>;
  stop(): Promise<{ stopped: boolean }>;
};

const DriverLocation = registerPlugin<DriverLocationPlugin>("DriverLocation");
const APP_ROLE = import.meta.env.VITE_APP_ROLE;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

let authGuardStarted = false;

function isNativeDriverBuild(): boolean {
  return isNative() && (APP_ROLE === "motorista" || APP_ROLE === "driver");
}

/**
 * Mantém um guard global depois que a tela operacional foi aberta ao menos uma
 * vez. Assim, um logout posterior também encerra o foreground service nativo,
 * mesmo que o motorista tenha navegado para outra rota antes de sair.
 */
export function ensureDriverBackgroundLocationAuthGuard(): void {
  if (authGuardStarted || !isNativeDriverBuild()) return;
  authGuardStarted = true;

  supabase.auth.onAuthStateChange((event) => {
    if (event !== "SIGNED_OUT") return;
    void stopDriverBackgroundLocation().catch((err) => {
      console.warn("[APOIS MOTORISTA] falha ao encerrar localização nativa no logout", err);
    });
  });
}

/**
 * Inicia/reidrata o Foreground Service apenas no APK do Motorista e somente
 * quando há sessão Supabase válida. Os tokens são entregues diretamente ao
 * plugin nativo; nunca são serializados em logs ou armazenamento próprio.
 */
export async function startDriverBackgroundLocation(): Promise<boolean> {
  if (!isNativeDriverBuild()) return false;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    console.warn("[APOIS MOTORISTA] configuração Supabase ausente para localização nativa");
    return false;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    console.warn("[APOIS MOTORISTA] sessão ausente para localização nativa");
    return false;
  }

  const result = await DriverLocation.start({
    supabaseUrl: SUPABASE_URL,
    publishableKey: SUPABASE_PUBLISHABLE_KEY,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token ?? "",
  });
  return result.started === true;
}

/** Encerra o serviço nativo quando o motorista fica offline ou encerra sessão. */
export async function stopDriverBackgroundLocation(): Promise<void> {
  if (!isNativeDriverBuild()) return;
  await DriverLocation.stop();
}
