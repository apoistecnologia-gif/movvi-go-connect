// Server function: aprovar motorista + criar assinatura Asaas em uma etapa.
// Chamado pelo painel admin. É idempotente — reaprovar não duplica assinatura.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MOVVI_MONTHLY_FEE_BRL } from "./types";

const uuid = z.string().uuid();

interface ApproveInput {
  driverId: string;
}

export const approveDriverAndCreateSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ApproveInput) => z.object({ driverId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1) Autorização — precisa ser admin
    const { data: isAdmin, error: roleErr } = await (supabase.rpc as any)("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr) throw new Error("role_check_failed");
    if (!isAdmin) throw new Error("forbidden");

    // 2) Carregar motorista
    const { data: driver, error: dErr } = await supabase
      .from("drivers")
      .select(
        "id, user_id, name, email, phone, cpf, city, state, approval_status, asaas_customer_id, asaas_subscription_id, financial_status, subscription_value, next_due_date",
      )
      .eq("id", data.driverId)
      .maybeSingle();
    if (dErr || !driver) throw new Error("driver_not_found");

    // 3) Validar dados mínimos exigidos pela Asaas
    const missing: string[] = [];
    if (!driver.name?.trim()) missing.push("nome");
    if (!driver.email?.trim()) missing.push("email");
    if (!driver.phone?.trim()) missing.push("telefone");
    if (!driver.cpf?.trim()) missing.push("CPF/CNPJ");
    if (!driver.city?.trim()) missing.push("cidade");
    if (!driver.state?.trim()) missing.push("estado");
    if (missing.length) {
      throw new Error(`missing_required_fields:${missing.join(",")}`);
    }

    // 4) Server-only imports (nunca no bundle do cliente)
    const { asaasProvider } = await import("./asaas.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 5) Se já tem assinatura, apenas garante que o approval_status ficou aprovado
    if (driver.asaas_subscription_id) {
      const patch: Record<string, unknown> = {};
      if (driver.approval_status !== "aprovado") {
        patch.approval_status = "aprovado";
        patch.approved_at = new Date().toISOString();
        patch.documents_status = "approved";
      }
      if (Object.keys(patch).length) {
        await supabaseAdmin.from("drivers").update(patch as any).eq("id", driver.id);
      }
      return {
        ok: true as const,
        alreadyExists: true,
        subscriptionId: driver.asaas_subscription_id,
        invoiceUrl: null as string | null,
        dueDate: driver.next_due_date,
      };
    }

    // 6) Garantir customer no Asaas
    let customerId = driver.asaas_customer_id as string | null;
    if (!customerId) {
      const ensured = await asaasProvider.ensureCustomer({
        driverId: driver.id,
        name: driver.name!,
        email: driver.email!,
        phone: driver.phone,
        cpfCnpj: driver.cpf,
      });
      customerId = ensured.customerId;
      await supabaseAdmin
        .from("drivers")
        .update({ asaas_customer_id: customerId })
        .eq("id", driver.id);
    }

    // 7) Criar subscription mensal (vencimento em 3 dias)
    const due = new Date();
    due.setDate(due.getDate() + 3);
    const nextDueDate = due.toISOString().slice(0, 10);

    let subResult;
    try {
      subResult = await asaasProvider.createSubscription({
        driverId: driver.id,
        customerId,
        value: MOVVI_MONTHLY_FEE_BRL,
        nextDueDate,
        description: "Mensalidade Motorista MOVVI",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      throw new Error(`asaas_subscription_failed:${msg}`);
    }

    // 8) Persistir — motorista + subscriptions + evento
    const nowIso = new Date().toISOString();
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await supabaseAdmin
      .from("drivers")
      .update({
        approval_status: "aprovado",
        approved_at: nowIso,
        documents_status: "approved",
        asaas_subscription_id: subResult.subscriptionId,
        subscription_value: MOVVI_MONTHLY_FEE_BRL,
        next_due_date: subResult.nextDueDate,
        financial_status: "pending",
        last_payment_id: subResult.firstPaymentId,
        last_payment_status: "PENDING",
        last_invoice_url: subResult.invoiceUrl ?? subResult.bankSlipUrl,
      } as any)
      .eq("id", driver.id);

    const { data: subRow } = await supabaseAdmin
      .from("subscriptions")
      .insert({
        driver_id: driver.id,
        status: "pending",
        amount: MOVVI_MONTHLY_FEE_BRL,
        period_start: nowIso,
        period_end: periodEnd,
        provider_reference: subResult.subscriptionId,
        asaas_payment_id: subResult.firstPaymentId,
        payment_method: "pix",
        invoice_url: subResult.invoiceUrl ?? subResult.bankSlipUrl,
      })
      .select("id")
      .single();

    await supabaseAdmin.from("driver_payment_events").insert({
      driver_id: driver.id,
      asaas_event: "SUBSCRIPTION_CREATED",
      asaas_payment_id: subResult.firstPaymentId,
      asaas_subscription_id: subResult.subscriptionId,
      status: "PENDING",
      value: MOVVI_MONTHLY_FEE_BRL,
      due_date: subResult.nextDueDate,
      invoice_url: subResult.invoiceUrl ?? subResult.bankSlipUrl,
      raw_payload: {
        source: "approveDriverAndCreateSubscription",
        subscription: JSON.parse(JSON.stringify(subResult)),
      } as any,
    } as any);

    return {
      ok: true as const,
      alreadyExists: false,
      subscriptionId: subResult.subscriptionId,
      invoiceUrl: subResult.invoiceUrl ?? subResult.bankSlipUrl,
      dueDate: subResult.nextDueDate,
      internalSubscriptionRowId: subRow?.id ?? null,
    };
  });
