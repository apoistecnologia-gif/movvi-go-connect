import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_TOKEN = Deno.env.get("ASAAS_WEBHOOK_TOKEN")?.trim() ?? "";
const MONTHLY_FEE_CENTS = 4990;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function paidThroughForDueDate(dueDate: unknown): string {
  const raw = String(dueDate ?? "");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T23:59:59.999Z`)
    : new Date();
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!WEBHOOK_TOKEN) return json({ error: "webhook_not_configured" }, 503);
  const incomingToken = req.headers.get("asaas-access-token") ?? "";
  if (incomingToken !== WEBHOOK_TOKEN) return json({ error: "unauthorized" }, 401);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const eventId = String(payload?.id ?? "").trim();
  const eventType = String(payload?.event ?? "").trim().toUpperCase();
  const payment = payload?.payment ?? null;
  const paymentId = String(payment?.id ?? "").trim();
  if (!eventId || !eventType) return json({ error: "invalid_event" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: existing } = await admin
    .from("asaas_webhook_events")
    .select("status")
    .eq("event_id", eventId)
    .maybeSingle();
  if (existing?.status === "processed" || existing?.status === "ignored") {
    return json({ ok: true, duplicate: true });
  }

  const { error: eventWriteError } = await admin.from("asaas_webhook_events").upsert({
    event_id: eventId,
    event_type: eventType,
    provider_payment_id: paymentId || null,
    payload,
    status: "received",
    error: null,
    received_at: new Date().toISOString(),
  }, { onConflict: "event_id" });
  if (eventWriteError) return json({ error: "event_persist_failed" }, 500);

  try {
    const paymentEvents = new Set([
      "PAYMENT_CREATED",
      "PAYMENT_CONFIRMED",
      "PAYMENT_RECEIVED",
      "PAYMENT_OVERDUE",
      "PAYMENT_REFUNDED",
      "PAYMENT_DELETED",
    ]);
    if (!paymentEvents.has(eventType) || !paymentId) {
      await admin.from("asaas_webhook_events").update({
        status: "ignored",
        processed_at: new Date().toISOString(),
      }).eq("event_id", eventId);
      return json({ ok: true, ignored: true });
    }

    let { data: membershipCharge } = await admin
      .from("driver_membership_charges")
      .select("id,driver_id,provider_payment_id,provider_subscription_id,due_date")
      .eq("provider_payment_id", paymentId)
      .maybeSingle();

    if (!membershipCharge && payment?.subscription) {
      const { data: membership } = await admin
        .from("driver_memberships")
        .select("driver_id,provider_subscription_id")
        .eq("provider_subscription_id", String(payment.subscription))
        .maybeSingle();
      const valueCents = Math.round(Number(payment?.value ?? 0) * 100);
      if (membership && valueCents === MONTHLY_FEE_CENTS) {
        const { data: createdCharge, error: chargeInsertError } = await admin
          .from("driver_membership_charges")
          .upsert({
            driver_id: membership.driver_id,
            provider_payment_id: paymentId,
            provider_subscription_id: membership.provider_subscription_id,
            amount_cents: MONTHLY_FEE_CENTS,
            due_date: payment?.dueDate ?? new Date().toISOString().slice(0, 10),
            status: eventType === "PAYMENT_OVERDUE" ? "overdue" : "pending",
            updated_at: new Date().toISOString(),
          }, { onConflict: "provider_payment_id" })
          .select("id,driver_id,provider_payment_id,provider_subscription_id,due_date")
          .single();
        if (chargeInsertError) throw chargeInsertError;
        membershipCharge = createdCharge;
      }
    }

    if (membershipCharge) {
      const nowIso = new Date().toISOString();
      if (eventType === "PAYMENT_RECEIVED") {
        const paidThrough = paidThroughForDueDate(membershipCharge.due_date);
        await admin.from("driver_membership_charges").update({
          status: "received",
          paid_at: nowIso,
          updated_at: nowIso,
        }).eq("id", membershipCharge.id);
        await admin.from("driver_memberships").update({
          current_payment_id: paymentId,
          status: "active",
          paid_through: paidThrough,
          last_payment_status: "RECEIVED",
          last_payment_at: nowIso,
          next_due_date: paidThrough.slice(0, 10),
          updated_at: nowIso,
        }).eq("driver_id", membershipCharge.driver_id);
        await admin.from("drivers").update({
          subscription_status: "active",
          updated_at: nowIso,
        }).eq("id", membershipCharge.driver_id);
      } else if (eventType === "PAYMENT_CONFIRMED") {
        await admin.from("driver_membership_charges").update({ status: "confirmed", updated_at: nowIso }).eq("id", membershipCharge.id);
        await admin.from("driver_memberships").update({ last_payment_status: "CONFIRMED", updated_at: nowIso }).eq("driver_id", membershipCharge.driver_id);
      } else if (eventType === "PAYMENT_OVERDUE") {
        await admin.from("driver_membership_charges").update({ status: "overdue", updated_at: nowIso }).eq("id", membershipCharge.id);
        const { data: membership } = await admin.from("driver_memberships").select("paid_through").eq("driver_id", membershipCharge.driver_id).single();
        if (!membership?.paid_through || new Date(membership.paid_through) <= new Date()) {
          await admin.from("driver_memberships").update({ status: "overdue", last_payment_status: "OVERDUE", updated_at: nowIso }).eq("driver_id", membershipCharge.driver_id);
          await admin.from("drivers").update({ subscription_status: "inactive", is_online: false, updated_at: nowIso }).eq("id", membershipCharge.driver_id);
        }
      } else if (eventType === "PAYMENT_REFUNDED" || eventType === "PAYMENT_DELETED") {
        const chargeStatus = eventType === "PAYMENT_REFUNDED" ? "refunded" : "cancelled";
        await admin.from("driver_membership_charges").update({ status: chargeStatus, updated_at: nowIso }).eq("id", membershipCharge.id);
        await admin.from("driver_memberships").update({ status: "inactive", last_payment_status: eventType.replace("PAYMENT_", ""), updated_at: nowIso }).eq("driver_id", membershipCharge.driver_id);
        await admin.from("drivers").update({ subscription_status: "inactive", is_online: false, updated_at: nowIso }).eq("id", membershipCharge.driver_id);
      }

      await admin.from("asaas_webhook_events").update({ status: "processed", processed_at: nowIso }).eq("event_id", eventId);
      return json({ ok: true, kind: "driver_membership" });
    }

    const { data: ridePayment } = await admin
      .from("ride_pix_payments")
      .select("id,ride_id")
      .eq("provider_payment_id", paymentId)
      .maybeSingle();
    if (ridePayment) {
      const nowIso = new Date().toISOString();
      const mappedStatus = eventType === "PAYMENT_RECEIVED" ? "received"
        : eventType === "PAYMENT_CONFIRMED" ? "confirmed"
        : eventType === "PAYMENT_OVERDUE" ? "overdue"
        : eventType === "PAYMENT_REFUNDED" ? "refunded"
        : eventType === "PAYMENT_DELETED" ? "cancelled" : "pending";
      await admin.from("ride_pix_payments").update({
        status: mappedStatus,
        paid_at: eventType === "PAYMENT_RECEIVED" ? nowIso : undefined,
        updated_at: nowIso,
      }).eq("id", ridePayment.id);

      if (eventType === "PAYMENT_RECEIVED") {
        const gross = Number(payment?.value ?? 0);
        const net = Number(payment?.netValue ?? gross);
        const providerFee = Math.max(0, Number((gross - net).toFixed(2)));
        if (!Number.isFinite(net) || net <= 0) throw new Error("asaas_payment_net_value_invalid");
        const { error: settlementError } = await admin.rpc("settle_asaas_ride_payment", {
          _ride_id: ridePayment.ride_id,
          _provider_payment_id: paymentId,
          _net_amount: Number(net.toFixed(2)),
          _provider_fee: providerFee,
        });
        if (settlementError) throw settlementError;
      } else if (eventType === "PAYMENT_REFUNDED") {
        // Do not fabricate a client-side reversal. The refund is persisted and
        // remains blocked from automatic re-credit; a dedicated atomic reversal
        // primitive handles wallet/debt reconciliation in the next finance gate.
        await admin.from("ride_settlements").update({
          payment_status: "refunded",
          status: "refunded",
          updated_at: nowIso,
        }).eq("ride_id", ridePayment.ride_id);
      }

      await admin.from("asaas_webhook_events").update({ status: "processed", processed_at: nowIso }).eq("event_id", eventId);
      return json({ ok: true, kind: "ride_payment" });
    }

    await admin.from("asaas_webhook_events").update({ status: "ignored", processed_at: new Date().toISOString() }).eq("event_id", eventId);
    return json({ ok: true, ignored: true });
  } catch (error) {
    const message = String(error).slice(0, 500);
    console.error("[asaas-webhook] processing failed", message);
    await admin.from("asaas_webhook_events").update({ status: "failed", error: message }).eq("event_id", eventId);
    return json({ error: "processing_failed" }, 500);
  }
});
