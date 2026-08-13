import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

interface ApproveInput {
  driverId: string;
}

/**
 * Aprovação administrativa canônica. A autorização e a transição de estado
 * ficam no RPC SECURITY DEFINER `admin_set_driver_approval`; aprovação não
 * cria cobrança automaticamente e não depende da integração Asaas legada.
 */
export const approveDriverAndCreateSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ApproveInput) => z.object({ driverId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: approved, error } = await supabase.rpc("admin_set_driver_approval", {
      _driver_id: data.driverId,
      _status: "aprovado",
    });
    if (error) {
      if (error.message.toLowerCase().includes("forbidden")) throw new Error("forbidden");
      if (error.message.toLowerCase().includes("driver_not_found")) throw new Error("driver_not_found");
      throw new Error(`driver_approval_failed:${error.message}`);
    }

    return {
      ok: true as const,
      driver: approved,
      subscriptionCheckoutAvailable: false,
      message: "Motorista aprovado. A mensalidade não foi cobrada porque o checkout de assinatura ainda não está homologado.",
    };
  });
