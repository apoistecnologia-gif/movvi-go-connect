import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { APOIS_MONTHLY_FEE_BRL, type SubscriptionPaymentMethod } from "./types";

interface CreateChargeInput {
  method: SubscriptionPaymentMethod;
}

/**
 * O backend oficial ainda não expõe checkout homologado de mensalidade do
 * motorista. Não criamos cobrança fake, tabela fantasma ou integração Asaas
 * paralela. Enquanto o trilho real não existir, a ação falha explicitamente.
 */
export const createDriverMonthlyCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CreateChargeInput) => ({
    method: data.method === "credit_card" ? "credit_card" : "pix",
  }))
  .handler(async () => {
    throw new Error("driver_subscription_checkout_not_homologated");
  });

/** Estado real da assinatura salvo no perfil canônico do motorista. */
export const getDriverSubscriptionInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: profileId, error: profileError } = await supabase.rpc("mobility_user_id");
    if (profileError || !profileId) return null;

    const { data: driver, error } = await supabase
      .from("drivers")
      .select("id,approval_status,subscription_status")
      .eq("user_id", profileId)
      .maybeSingle();
    if (error || !driver) return null;

    return {
      driverId: driver.id,
      approvalStatus: driver.approval_status,
      subscriptionStatus: driver.subscription_status,
      nextDueAt: null as string | null,
      latest: null,
      monthlyFee: APOIS_MONTHLY_FEE_BRL,
      checkoutAvailable: false,
    };
  });
