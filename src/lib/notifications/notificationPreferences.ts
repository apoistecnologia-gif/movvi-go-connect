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

type LocalPreferences = Pick<NotificationPreferences, "sound" | "vibration">;

function readLocal(userId: string): LocalPreferences {
  try {
    const raw = localStorage.getItem(`${LOCAL_PREFIX}${userId}`);
    if (!raw) return { sound: DEFAULT_PREFERENCES.sound, vibration: DEFAULT_PREFERENCES.vibration };
    const parsed = JSON.parse(raw) as Partial<LocalPreferences>;
    return {
      sound: typeof parsed.sound === "boolean" ? parsed.sound : DEFAULT_PREFERENCES.sound,
      vibration: typeof parsed.vibration === "boolean" ? parsed.vibration : DEFAULT_PREFERENCES.vibration,
    };
  } catch {
    return { sound: DEFAULT_PREFERENCES.sound, vibration: DEFAULT_PREFERENCES.vibration };
  }
}

function writeLocal(userId: string, prefs: LocalPreferences) {
  localStorage.setItem(`${LOCAL_PREFIX}${userId}`, JSON.stringify(prefs));
}

/**
 * O schema oficial persiste apenas preferências que o backend consegue aplicar.
 * Som e vibração são características do aparelho e ficam locais.
 */
export async function fetchPreferences(): Promise<NotificationPreferences> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return DEFAULT_PREFERENCES;

  const local = readLocal(userId);
  const { data, error } = await supabase
    .from("user_notification_preferences")
    .select("ride_updates,ride_requests,payment_updates,promotions")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return { ...DEFAULT_PREFERENCES, ...local };
  return {
    ride_updates: data.ride_updates,
    ride_requests: data.ride_requests,
    payment_reminders: data.payment_updates,
    promotions: data.promotions,
    ...local,
  };
}

export async function savePreferences(prefs: Partial<NotificationPreferences>): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return;

  const current = await fetchPreferences();
  const merged = { ...current, ...prefs };
  writeLocal(userId, { sound: merged.sound, vibration: merged.vibration });

  const { error } = await supabase
    .from("user_notification_preferences")
    .upsert({
      user_id: userId,
      ride_updates: merged.ride_updates,
      ride_requests: merged.ride_requests,
      payment_updates: merged.payment_reminders,
      promotions: merged.promotions,
    }, { onConflict: "user_id" });

  if (error) throw error;
}
