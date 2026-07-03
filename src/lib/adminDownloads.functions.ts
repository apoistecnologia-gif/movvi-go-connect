// Admin-only signed URL for the MOVVI source ZIP.
// Replaces the previously public /api/public/download/movvi-source endpoint.
// Requires an authenticated admin session (has_role check) before creating
// the short-lived signed URL from the private `downloads` bucket.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMovviSourceSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, supabase } = context;
    const { data: isAdmin, error: roleErr } = await (
      supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: boolean | null; error: unknown }>;
      }
    ).rpc("has_role", { _user_id: userId, _role: "admin" });
    if (roleErr) throw new Error("role_check_failed");
    if (!isAdmin) throw new Error("forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.storage
      .from("downloads")
      .createSignedUrl("movvi-drive-source.zip", 60 * 5, {
        download: "movvi-drive-source.zip",
      });
    if (error || !data?.signedUrl) throw new Error("file_unavailable");
    return { url: data.signedUrl };
  });
