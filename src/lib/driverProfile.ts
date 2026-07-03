// MOVVI DRIVE — busca robusta do perfil do motorista logado.
// Estratégia:
// 1) Busca em public.drivers por user_id = auth.uid (caminho oficial).
// 2) Se não encontrar, faz fallback por e-mail do usuário autenticado
//    (cobre casos históricos onde user_id ficou desalinhado).
// 3) Loga claramente o que aconteceu para diagnóstico.
//
// Não cria registros automaticamente. Retorna null SOMENTE quando não há
// nenhum motorista vinculado ao usuário autenticado.

import { supabase } from "@/integrations/supabase/client";

export type DriverProfileRow = {
  id: string;
  user_id: string;
  approval_status: "em_analise" | "aprovado" | "reprovado" | "bloqueado";
  motivo_reprovacao: string | null;
  email: string | null;
  subscription_status: "active" | "inactive" | "overdue" | "pending" | "suspended" | null;
  photo_url: string | null;
  selfie_url: string | null;
  cnh_url: string | null;
  cnh_back_url: string | null;
  vehicle_document_url: string | null;
  documents_status: "pending_upload" | "pending_review" | "approved" | "rejected" | null;
};

const SELECT_COLS =
  "id, user_id, approval_status, motivo_reprovacao, email, subscription_status, photo_url, selfie_url, cnh_url, cnh_back_url, vehicle_document_url, documents_status";


export async function loadDriverProfile(): Promise<
  | { ok: true; profile: DriverProfileRow }
  | { ok: false; reason: "no_session" | "not_found" | "error"; message?: string }
> {
  const { data: u, error: authErr } = await supabase.auth.getUser();
  if (authErr || !u?.user) {
    if (import.meta.env.DEV) console.warn("[MOVVI MOTORISTA] sem sessão autenticada", authErr?.message);
    return { ok: false, reason: "no_session" };
  }
  const uid = u.user.id;
  const email = u.user.email ?? null;
  if (import.meta.env.DEV) console.log("[MOVVI MOTORISTA] carregando perfil", { uid, email });

  // 1) caminho oficial: user_id = auth.uid
  const byId = await supabase
    .from("drivers")
    .select(SELECT_COLS)
    .eq("user_id", uid)
    .maybeSingle();

  if (byId.error) {
    console.error("[MOVVI MOTORISTA] erro consulta por user_id", byId.error);
    return { ok: false, reason: "error", message: byId.error.message };
  }
  if (byId.data) {
    if (import.meta.env.DEV) console.log("[MOVVI MOTORISTA] perfil encontrado por user_id", byId.data);
    return { ok: true, profile: byId.data as DriverProfileRow };
  }

  // 2) fallback por e-mail (registros antigos com user_id desalinhado)
  if (email) {
    const byEmail = await supabase
      .from("drivers")
      .select(SELECT_COLS)
      .eq("email", email)
      .maybeSingle();
    if (byEmail.error) {
      if (import.meta.env.DEV) console.warn("[MOVVI MOTORISTA] erro consulta por email", byEmail.error);
    } else if (byEmail.data) {
      if (import.meta.env.DEV) console.warn(
        "[MOVVI MOTORISTA] perfil encontrado por EMAIL (user_id desalinhado)",
        byEmail.data,
      );
      return { ok: true, profile: byEmail.data as DriverProfileRow };
    }
  }

  if (import.meta.env.DEV) console.warn("[MOVVI MOTORISTA] nenhum motorista vinculado", { uid, email });
  return { ok: false, reason: "not_found" };
}

/**
 * Retorna problemas que impedem o motorista de completar o perfil
 * (foto + 4 documentos obrigatórios). Não altera nada relacionado a corridas.
 */
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
