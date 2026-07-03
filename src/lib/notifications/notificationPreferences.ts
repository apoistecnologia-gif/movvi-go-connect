// User notification preferences: read/upsert helpers. RLS scopes rows to auth.uid().

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

export async function fetchPreferences(): Promise<NotificationPreferences> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return DEFAULT_PREFERENCES;
  const { data } = await supabase
    .from("user_notification_preferences")
    .select("ride_updates,ride_requests,payment_reminders,promotions,sound,vibration")
    .eq("user_id", uid)
    .maybeSingle();
  return { ...DEFAULT_PREFERENCES, ...(data ?? {}) };
}

export async function savePreferences(prefs: Partial<NotificationPreferences>): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return;
  const merged = { ...DEFAULT_PREFERENCES, ...prefs, user_id: uid };
  await supabase
    .from("user_notification_preferences")
    .upsert(merged, { onConflict: "user_id" });
}
