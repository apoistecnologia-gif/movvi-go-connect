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
};

const SELECT_COLS = "id, user_id, approval_status, motivo_reprovacao, email";

export async function loadDriverProfile(): Promise<
  | { ok: true; profile: DriverProfileRow }
  | { ok: false; reason: "no_session" | "not_found" | "error"; message?: string }
> {
  const { data: u, error: authErr } = await supabase.auth.getUser();
  if (authErr || !u?.user) {
    console.warn("[MOVVI MOTORISTA] sem sessão autenticada", authErr?.message);
    return { ok: false, reason: "no_session" };
  }
  const uid = u.user.id;
  const email = u.user.email ?? null;
  console.log("[MOVVI MOTORISTA] carregando perfil", { uid, email });

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
    console.log("[MOVVI MOTORISTA] perfil encontrado por user_id", byId.data);
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
      console.warn("[MOVVI MOTORISTA] erro consulta por email", byEmail.error);
    } else if (byEmail.data) {
      console.warn(
        "[MOVVI MOTORISTA] perfil encontrado por EMAIL (user_id desalinhado)",
        byEmail.data,
      );
      return { ok: true, profile: byEmail.data as DriverProfileRow };
    }
  }

  console.warn("[MOVVI MOTORISTA] nenhum motorista vinculado", { uid, email });
  return { ok: false, reason: "not_found" };
}
