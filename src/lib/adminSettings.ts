import { supabase } from "@/integrations/supabase/client";

export type AdminSettingRow = {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
};

export async function getAdminSettings(keys: string[]): Promise<AdminSettingRow[]> {
  const { data, error } = await (supabase as any).rpc("admin_get_settings", {
    _keys: keys,
  });
  if (error) throw new Error(error.message || "admin_settings_read_failed");
  return (data ?? []) as AdminSettingRow[];
}
