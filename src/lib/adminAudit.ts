import { supabase } from "@/integrations/supabase/client";

export async function logAdminAction(params: {
  action: string;
  entity: string;
  entity_id?: string | null;
  before?: unknown;
  after?: unknown;
}) {
  try {
    const { data } = await supabase.auth.getUser();
    await supabase.from("admin_audit_logs").insert({
      actor_id: data?.user?.id ?? null,
      action: params.action,
      entity: params.entity,
      entity_id: params.entity_id ?? null,
      before: (params.before ?? null) as never,
      after: (params.after ?? null) as never,
    });
  } catch (err) {
    if (import.meta.env.DEV) console.warn("[APOIS] audit log failed:", err);
  }
}
