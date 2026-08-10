import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface Input {
  subscriptionId: string;
}

/**
 * Compatibilidade temporária para consumidores antigos. O banco oficial não
 * possui `subscriptions`/Asaas e não há pagamento a reconciliar por esse
 * caminho. Mantemos a API explícita e segura em vez de consultar entidades
 * inexistentes ou fingir sucesso.
 */
export const adminRefreshAsaasPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Input) => ({ subscriptionId: String(data.subscriptionId ?? "").trim() }))
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: authorized, error } = await supabase.rpc("admin_is_authorized");
    if (error || !authorized) throw new Error("forbidden");

    return {
      ok: false as const,
      reason: "legacy_provider_retired",
      message: "A reconciliação Asaas foi desativada. O backend oficial ainda não possui checkout homologado de mensalidade do motorista.",
    };
  });

export const adminRefreshSubscriptionPayment = adminRefreshAsaasPayment;
