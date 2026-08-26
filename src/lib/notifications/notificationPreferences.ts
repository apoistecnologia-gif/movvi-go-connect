import { supabase } from "@/integrations/supabase/client";

export type NotificationPreferences = {
  ride_updates: boolean;
  ride_requests: boolean;
  payment_reminders: boolean;
  promotions: boolean;
  sound: boolean;
  vibration: boolean;
};

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  ride_updates: true,
  ride_requests: true,
  payment_reminders: true,
  promotions: false,
  sound: true,
  vibration: true,
};

const LOCAL_PREFIX = "apois:notification-local:";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type LocalPreferences = Pick<NotificationPreferences, "sound" | "vibration">;
type RpcResult<T> = { data: T | null; error: { message: string } | null };
type MobilityRpcClient = {
  rpc: (name: "mobility_user_id", args?: Record<string, never>) => PromiseLike<RpcResult<string>>;
};

const rpcClient = supabase as unknown as MobilityRpcClient;

function booleanOrDefault(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readLocal(userId: string): LocalPreferences {
  try {
    const raw = localStorage.getItem(`${LOCAL_PREFIX}${userId}`);
    if (!raw) return { sound: DEFAULT_PREFERENCES.sound, vibration: DEFAULT_PREFERENCES.vibration };
    const parsed = JSON.parse(raw) as Partial<LocalPreferences>;
    return {
      sound: booleanOrDefault(parsed.sound, DEFAULT_PREFERENCES.sound),
      vibration: booleanOrDefault(parsed.vibration, DEFAULT_PREFERENCES.vibration),
    };
  } catch {
    return { sound: DEFAULT_PREFERENCES.sound, vibration: DEFAULT_PREFERENCES.vibration };
  }
}

function writeLocal(userId: string, prefs: LocalPreferences): void {
  try {
    localStorage.setItem(`${LOCAL_PREFIX}${userId}`, JSON.stringify(prefs));
  } catch (error) {
    if (import.meta.env.DEV) console.warn("[APOIS notifications] local preference storage unavailable", error);
  }
}

async function resolveIdentity(): Promise<{ authUserId: string; mobilityUserId: string }> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error("notification_preferences_session_unavailable");
  const authUserId = String(auth?.user?.id ?? "").trim();
  if (!UUID_RE.test(authUserId)) throw new Error("notification_preferences_no_session");

  // user_notification_preferences.user_id referencia public.users.id, não
  // auth.users.id. A RPC canônica aplica exatamente a mesma resolução usada
  // pelas policies RLS (mobility_user_id()), evitando preferências invisíveis
  // ou INSERT bloqueado por FK/RLS quando esses UUIDs são diferentes.
  const { data: mobilityUserIdRaw, error } = await rpcClient.rpc("mobility_user_id", {});
  if (error) throw new Error("notification_preferences_identity_unavailable");
  const mobilityUserId = String(mobilityUserIdRaw ?? "").trim();
  if (!UUID_RE.test(mobilityUserId)) throw new Error("notification_preferences_profile_missing");
  return { authUserId, mobilityUserId };
}

/**
 * O schema oficial persiste apenas preferências que o backend consegue aplicar.
 * Som e vibração são características do aparelho e ficam locais.
 */
export async function fetchPreferences(): Promise<NotificationPreferences> {
  const { authUserId, mobilityUserId } = await resolveIdentity();
  const local = readLocal(authUserId);
  const { data, error } = await supabase
    .from("user_notification_preferences")
    .select("ride_updates,ride_requests,payment_updates,promotions")
    .eq("user_id", mobilityUserId)
    .maybeSingle();

  if (error) throw new Error("notification_preferences_load_failed");
  if (!data) return { ...DEFAULT_PREFERENCES, ...local };

  return {
    ride_updates: booleanOrDefault(data.ride_updates, DEFAULT_PREFERENCES.ride_updates),
    ride_requests: booleanOrDefault(data.ride_requests, DEFAULT_PREFERENCES.ride_requests),
    payment_reminders: booleanOrDefault(data.payment_updates, DEFAULT_PREFERENCES.payment_reminders),
    promotions: booleanOrDefault(data.promotions, DEFAULT_PREFERENCES.promotions),
    ...local,
  };
}

export async function savePreferences(prefs: Partial<NotificationPreferences>): Promise<void> {
  const { authUserId, mobilityUserId } = await resolveIdentity();
  const current = await fetchPreferences();
  const merged: NotificationPreferences = {
    ride_updates: booleanOrDefault(prefs.ride_updates, current.ride_updates),
    ride_requests: booleanOrDefault(prefs.ride_requests, current.ride_requests),
    payment_reminders: booleanOrDefault(prefs.payment_reminders, current.payment_reminders),
    promotions: booleanOrDefault(prefs.promotions, current.promotions),
    sound: booleanOrDefault(prefs.sound, current.sound),
    vibration: booleanOrDefault(prefs.vibration, current.vibration),
  };

  const { error } = await supabase
    .from("user_notification_preferences")
    .upsert({
      user_id: mobilityUserId,
      ride_updates: merged.ride_updates,
      ride_requests: merged.ride_requests,
      payment_updates: merged.payment_reminders,
      promotions: merged.promotions,
    }, { onConflict: "user_id" });

  if (error) throw new Error("notification_preferences_save_failed");
  writeLocal(authUserId, { sound: merged.sound, vibration: merged.vibration });
}
