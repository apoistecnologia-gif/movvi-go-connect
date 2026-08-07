// APOIS Motorista — perfil do motorista autenticado no Supabase oficial.
// O identificador operacional é public.users.id; auth.uid() nunca é usado
// diretamente como drivers.user_id.

import { supabase } from "@/integrations/supabase/client";

export type DriverProfileRow = {
  id: string;
  user_id: string;
  approval_status: "pendente" | "em_analise" | "aprovado" | "reprovado" | "bloqueado";
  motivo_reprovacao: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  subscription_status: "teste" | "active" | "ativa" | "inactive" | "overdue" | "pending" | "suspended" | null;
  photo_url: string | null;
  selfie_url: string | null;
  cnh_url: string | null;
  cnh_back_url: string | null;
  vehicle_document_url: string | null;
  documents_status: "pending_upload" | "pending_review" | "approved" | "rejected" | null;
};

export async function loadDriverProfile(): Promise<
  | { ok: true; profile: DriverProfileRow }
  | { ok: false; reason: "no_session" | "not_found" | "error"; message?: string }
> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) return { ok: false, reason: "no_session" };

  const { data, error } = await (supabase as any).rpc("driver_get_profile");
  if (error) {
    if (/profile_missing|driver_profile_missing/i.test(error.message ?? "")) {
      return { ok: false, reason: "not_found" };
    }
    console.error("[APOIS MOTORISTA] erro ao carregar perfil", error);
    return { ok: false, reason: "error", message: error.message };
  }
  if (!data) return { ok: false, reason: "not_found" };
  return { ok: true, profile: data as DriverProfileRow };
}

export function driverProfileCompletionIssues(p: DriverProfileRow): {
  complete: boolean;
  missingPhoto: boolean;
  missingDocs: boolean;
  message: string | null;
} {
  const missingPhoto = !p.photo_url && !p.selfie_url;
  const missingDocs =
    !p.selfie_url ||
    !p.cnh_url ||
    !p.cnh_back_url ||
    !p.vehicle_document_url ||
    p.documents_status === "pending_upload" ||
    p.documents_status === "rejected";
  const complete = !missingPhoto && !missingDocs;

  let message: string | null = null;
  if (missingPhoto && missingDocs) {
    message = "Complete sua foto de perfil e envie todos os documentos obrigatórios para continuar.";
  } else if (missingPhoto) {
    message = "Adicione sua foto de perfil para continuar.";
  } else if (missingDocs) {
    message =
      p.documents_status === "rejected"
        ? "Um ou mais documentos foram reprovados. Reenvie para continuar."
        : "Envie todos os 4 documentos obrigatórios para continuar.";
  }
  return { complete, missingPhoto, missingDocs, message };
}
