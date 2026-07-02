import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DocSlot = z.enum(["selfie", "cnh_front", "cnh_back", "crlv"]);

const UpdateSchema = z.object({
  slot: DocSlot,
  storagePath: z.string().min(3).max(500),
});

const COLUMN_BY_SLOT: Record<z.infer<typeof DocSlot>, string> = {
  selfie: "selfie_url",
  cnh_front: "cnh_url",
  cnh_back: "cnh_back_url",
  crlv: "vehicle_document_url",
};

/**
 * Records a newly-uploaded document path on the current driver profile.
 * The driver must be authenticated. When all 4 slots are filled, the profile
 * transitions to `documents_status = 'pending_review'`.
 * Ride logic, dispatch, RLS on rides, and approval_status are NOT touched.
 */
export const updateDriverDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Sanity: driver may only reference paths under their own uid prefix.
    if (!data.storagePath.startsWith(`${userId}/`)) {
      throw new Error("Caminho de arquivo inválido para este usuário.");
    }

    const column = COLUMN_BY_SLOT[data.slot];

    const existing = await supabaseAdmin
      .from("drivers")
      .select("user_id, selfie_url, cnh_url, cnh_back_url, vehicle_document_url, documents_status, approval_status")
      .eq("user_id", userId)
      .maybeSingle();
    if (existing.error) throw new Error("Falha ao ler cadastro do motorista.");
    if (!existing.data) throw new Error("Cadastro de motorista não encontrado.");

    const patch: Record<string, unknown> = { [column]: data.storagePath };

    const merged = { ...existing.data, ...patch } as Record<string, string | null>;
    const complete =
      !!merged.selfie_url &&
      !!merged.cnh_url &&
      !!merged.cnh_back_url &&
      !!merged.vehicle_document_url;

    // Only bump status forward for pending states; never overwrite approved/rejected.
    if (complete && existing.data.documents_status === "pending_upload") {
      patch.documents_status = "pending_review";
    } else if (!complete && existing.data.documents_status !== "approved") {
      patch.documents_status = "pending_upload";
    }

    const upd = await supabaseAdmin.from("drivers").update(patch).eq("user_id", userId);
    if (upd.error) throw new Error("Falha ao atualizar documento.");

    return {
      ok: true,
      slot: data.slot,
      documents_status: (patch.documents_status as string | undefined) ?? existing.data.documents_status,
      complete,
    };
  });

const RemoveSchema = z.object({ slot: DocSlot });

/**
 * Clears a document reference before final confirmation.
 * Also removes the stored file if a path is present.
 */
export const removeDriverDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RemoveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const column = COLUMN_BY_SLOT[data.slot];

    const existing = await supabaseAdmin
      .from("drivers")
      .select(`user_id, ${column}, documents_status`)
      .eq("user_id", userId)
      .maybeSingle();
    if (existing.error) throw new Error("Falha ao ler cadastro do motorista.");
    if (!existing.data) throw new Error("Cadastro de motorista não encontrado.");

    const prevPath = (existing.data as Record<string, unknown>)[column] as string | null | undefined;
    const bucket =
      data.slot === "selfie" ? "driver-selfies"
      : data.slot === "crlv" ? "vehicle-documents"
      : "driver-cnh";

    if (prevPath && prevPath.startsWith(`${userId}/`)) {
      await supabaseAdmin.storage.from(bucket).remove([prevPath]);
    }

    const patch: Record<string, unknown> = { [column]: null };
    if (existing.data.documents_status !== "approved") {
      patch.documents_status = "pending_upload";
    }

    const upd = await supabaseAdmin.from("drivers").update(patch).eq("user_id", userId);
    if (upd.error) throw new Error("Falha ao remover documento.");

    return { ok: true };
  });
