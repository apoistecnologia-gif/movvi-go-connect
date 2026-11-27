// APOIS Motorista — perfil do motorista autenticado no Supabase oficial.
// O identificador operacional é public.users.id; auth.uid() nunca é usado
// diretamente como drivers.user_id.

import { isHmlDispatch, readHmlDriverProfile } from "./hml-dispatch-client";
import { supabase } from "@/integrations/supabase/client";

export type DriverProfileRow = {
  id: string;
  user_id: string;
  category: string | null;
  approval_status: "pendente" | "em_analise" | "aprovado" | "reprovado" | "bloqueado" | "suspenso";
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
  vehicle_photo_url: string | null;
  documents_status: "pending_upload" | "pending_review" | "approved" | "rejected" | null;
  current_lat: number | string | null;
  current_lng: number | string | null;
  current_heading: number | string | null;
  current_speed: number | string | null;
  last_location_at: string | null;
};

let asaasSubaccountProvisioningAttempted = false;

async function ensureApprovedDriverAsaasSubaccount(profile: DriverProfileRow): Promise<void> {
  // HML is an isolated cash-only test environment; never call payment provisioning.
  if (import.meta.env.VITE_SUPABASE_URL === "https://apois-mobile-hml-apoistecnologia-dev.apps.rm3.7wse.p1.openshiftapps.com") return;
  if (profile.approval_status !== "aprovado" || asaasSubaccountProvisioningAttempted) return;

  asaasSubaccountProvisioningAttempted = true;
  try {
    const { data, error } = await supabase.functions.invoke("asaas-create-driver-subaccount", {
      body: {},
    });
    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));
  } catch (error) {
    // Não bloquear login/uso do app por indisponibilidade temporária do provedor.
    // O flag permanece "true" pelo resto desta sessão do app para evitar repetir a
    // chamada a cada navegação de rota (loadDriverProfile roda em ~11 telas) durante
    // uma instabilidade do Asaas; uma nova tentativa ocorre no próximo carregamento
    // completo do app.
    console.error("[APOIS MOTORISTA] falha ao provisionar subconta Asaas", error);
  }
}

export async function loadDriverProfile(): Promise<
  | { ok: true; profile: DriverProfileRow }
  | { ok: false; reason: "no_session" | "not_found" | "error"; message?: string }
> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) return { ok: false, reason: "no_session" };

  if (isHmlDispatch) {
    try {
      const p = await readHmlDriverProfile(sessionData.session.user.id);
      const approval = p.approval_status;
      if (!["pendente","em_analise","aprovado","reprovado","bloqueado","suspenso"].includes(String(approval))) return {ok:false,reason:"error",message:"Status de cadastro indisponível na homologação."};
      const str = (v:unknown):string|null => typeof v==="string" ? v : null;
      const num = (v:unknown):number|null => typeof v==="number" && Number.isFinite(v) ? v : null;
      // Missing fields are genuinely unavailable in the reduced HML schema.
      // Do not manufacture an approval, identity, photograph or document.
      const profile:DriverProfileRow = {
        id:String(p.id),user_id:String(p.user_id),category:str(p.category),
        approval_status:approval as DriverProfileRow["approval_status"],
        subscription_status:str(p.subscription_status) as DriverProfileRow["subscription_status"],
        name:null,email:sessionData.session.user.email??null,phone:null,motivo_reprovacao:null,
        photo_url:null,selfie_url:null,cnh_url:null,cnh_back_url:null,vehicle_document_url:null,vehicle_photo_url:null,documents_status:null,
        current_lat:num(p.current_lat),current_lng:num(p.current_lng),current_heading:num(p.current_heading),current_speed:num(p.current_speed),last_location_at:str(p.last_location_at),
      };
      return {ok:true,profile};
    } catch {return {ok:false,reason:"error",message:"Perfil de homologação indisponível."};}
  }
  const { data, error } = await (supabase as any).rpc("driver_get_profile");
  if (error) {
    if (/profile_missing|driver_profile_missing/i.test(error.message ?? "")) {
      return { ok: false, reason: "not_found" };
    }
    console.error("[APOIS MOTORISTA] erro ao carregar perfil", error);
    return { ok: false, reason: "error", message: error.message };
  }
  if (!data) return { ok: false, reason: "not_found" };

  const profile = data as DriverProfileRow;
  await ensureApprovedDriverAsaasSubaccount(profile);
  return { ok: true, profile };
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
    !p.vehicle_photo_url ||
    p.documents_status === "pending_upload" ||
    p.documents_status === "rejected";
  const complete = !missingPhoto && !missingDocs;

  let message: string | null = null;
  if (missingPhoto && missingDocs) {
    message = "Complete sua foto de perfil e envie os documentos obrigatórios para continuar.";
  } else if (missingPhoto) {
    message = "Adicione sua foto de perfil para continuar.";
  } else if (missingDocs) {
    message =
      p.documents_status === "rejected"
        ? "Um ou mais documentos foram reprovados. Reenvie para continuar."
        : "Envie CNH, CRLV e foto do veículo para continuar.";
  }
  return { complete, missingPhoto, missingDocs, message };
}
