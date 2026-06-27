import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKETS = {
  selfie_url: "driver-selfies",
  cnh_url: "driver-cnh",
  vehicle_document_url: "vehicle-documents",
} as const;

export const getDriverDocumentUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ driverId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const isAdmin = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (isAdmin.error || !isAdmin.data) {
      throw new Error("Apenas administradores podem visualizar documentos.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const driver = await supabaseAdmin
      .from("drivers")
      .select("selfie_url, cnh_url, vehicle_document_url")
      .eq("id", data.driverId)
      .maybeSingle();
    if (driver.error || !driver.data) throw new Error("Motorista não encontrado.");

    const out: Record<keyof typeof BUCKETS, string | null> = {
      selfie_url: null,
      cnh_url: null,
      vehicle_document_url: null,
    };

    await Promise.all(
      (Object.entries(BUCKETS) as Array<[keyof typeof BUCKETS, string]>).map(
        async ([field, bucket]) => {
          const path = driver.data?.[field];
          if (!path) return;
          const signed = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, 600);
          if (signed.error) {
            console.error(`[MOVVI DOCS] erro signed url ${field}:`, signed.error.message);
            return;
          }
          out[field] = signed.data?.signedUrl ?? null;
        },
      ),
    );

    return out;
  });
