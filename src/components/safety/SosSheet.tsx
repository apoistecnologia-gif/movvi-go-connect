import { useEffect, useMemo, useRef, useState } from "react";
import { Phone, Shield, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getApproxLocation } from "@/lib/safety/shareRide";
import { getPrimaryContact, type SafetyRole, type EmergencyContact } from "@/lib/safety/emergencyContacts";

interface Props {
  open: boolean;
  onClose: () => void;
  role: SafetyRole;
  rideId?: string | null;
  counterpartLabel?: string;
  onOpenContacts?: () => void;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizePhone(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  const normalized = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  if (normalized.length < 10 || normalized.length > 11) return null;
  return normalized;
}

export function SosSheet({ open, onClose, role, rideId, counterpartLabel, onOpenContacts }: Props) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [contact, setContact] = useState<EmergencyContact | null>(null);
  const [contactLoading, setContactLoading] = useState(false);
  const [alertError, setAlertError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const focusTimerRef = useRef<number | null>(null);
  const safeCounterpartLabel = String(counterpartLabel ?? "").trim().replace(/\s+/g, " ").slice(0, 160);
  const rideIdCandidate = String(rideId ?? "").trim();
  const safeRideId = UUID_RE.test(rideIdCandidate) ? rideIdCandidate : null;
  const contactPhone = useMemo(() => normalizePhone(contact?.phone), [contact?.phone]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSent(false);
    setSending(false);
    setAlertError(null);
    setContact(null);
    setContactLoading(true);

    void (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (!data?.user) return;

        const { data: domainUser, error: domainUserError } = await supabase
          .from("users")
          .select("id")
          .eq("auth_user_id", data.user.id)
          .maybeSingle();
        if (domainUserError) throw domainUserError;
        const domainUserId = String(domainUser?.id ?? "").trim();
        if (!UUID_RE.test(domainUserId)) return;

        const primaryContact = await getPrimaryContact(role, domainUserId);
        if (!cancelled) setContact(primaryContact);
      } catch (error) {
        if (!cancelled) setContact(null);
        if (import.meta.env.DEV) console.warn("[APOIS Safety] contato de emergência indisponível", error);
      } finally {
        if (!cancelled) setContactLoading(false);
      }
    })();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    focusTimerRef.current = window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    return () => {
      cancelled = true;
      if (focusTimerRef.current != null) {
        window.clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
      document.body.style.overflow = previousOverflow;
    };
  }, [open, role]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !sending) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open, sending]);

  async function sendAlert() {
    if (sending || sent) return;
    if (role === "passenger" && !safeRideId) {
      setAlertError("Não foi possível identificar a corrida ativa para enviar o SOS.");
      return;
    }

    setSending(true);
    setAlertError(null);
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth?.user) {
        setAlertError("Sua sessão expirou. Entre novamente para enviar o alerta à central.");
        return;
      }

      const pos = await getApproxLocation();
      const lat = typeof pos?.lat === "number" && Number.isFinite(pos.lat) && Math.abs(pos.lat) <= 90 ? pos.lat : null;
      const lng = typeof pos?.lng === "number" && Number.isFinite(pos.lng) && Math.abs(pos.lng) <= 180 ? pos.lng : null;
      const message = `Alerta SOS (${role})${safeCounterpartLabel ? ` — ${safeCounterpartLabel}` : ""}`.slice(0, 240);

      if (role === "driver") {
        const { error } = await supabase.rpc("create_driver_sos", {
          _lat: lat ?? undefined,
          _lng: lng ?? undefined,
          _severity: "critical",
          _message: message,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("create_passenger_sos", {
          _ride_id: safeRideId as string,
          _lat: lat ?? undefined,
          _lng: lng ?? undefined,
          _severity: "critical",
          _message: message,
        });
        if (error) throw error;
      }

      setSent(true);
      toast.success("Alerta SOS enviado à central APOIS");
    } catch (err) {
      if (import.meta.env.DEV) console.error("[APOIS] SOS", err);
      setAlertError("Não foi possível enviar o alerta à central. Em risco imediato, use o serviço de emergência local.");
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[220] flex items-end justify-center bg-black/70 backdrop-blur-sm animate-in fade-in motion-reduce:animate-none"
      onClick={() => !sending && onClose()}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[calc(100dvh-env(safe-area-inset-top)-12px)] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] ring-1 ring-destructive/40 animate-in slide-in-from-bottom motion-reduce:animate-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="apois-sos-title"
        aria-describedby="apois-sos-description"
        aria-busy={sending}
      >
        <div className="mx-auto -mt-1 mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden="true" />

        <div className="mb-3 flex min-w-0 items-center gap-2">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-destructive/15 text-destructive ring-1 ring-destructive/30">
            <Shield className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div id="apois-sos-title" className="break-words text-[15px] font-extrabold leading-5">Emergência durante a corrida</div>
            <div className="mt-0.5 break-words text-xs leading-4 text-muted-foreground">
              Use apenas em caso real de risco.
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => !sending && onClose()}
            disabled={sending}
            className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/40 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Fechar emergência"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {sent ? (
          <div id="apois-sos-description" role="status" className="rounded-2xl bg-primary/10 p-3 text-[13px] leading-5 ring-1 ring-primary/30">
            Alerta enviado. A central recebeu os dados disponíveis da corrida e da sua localização. Mantenha-se em local seguro.
          </div>
        ) : (
          <p id="apois-sos-description" className="break-words text-[13px] leading-5 text-muted-foreground">
            Vamos registrar sua localização atual e os dados disponíveis da corrida para acionamento da central APOIS.
            {safeCounterpartLabel ? ` (${safeCounterpartLabel})` : ""}
          </p>
        )}

        {alertError ? (
          <p role="alert" className="mt-3 break-words rounded-xl bg-destructive/10 px-3 py-2 text-xs leading-4 text-destructive ring-1 ring-destructive/25">
            {alertError}
          </p>
        ) : null}

        <div className="mt-4 grid gap-2">
          <a
            href="tel:190"
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-destructive px-4 py-3 text-center text-[14px] font-bold text-destructive-foreground active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 motion-reduce:transform-none"
            aria-label="Ligar para a Polícia no número 190"
          >
            <Phone className="h-4 w-4" aria-hidden="true" /> Ligar 190 — Polícia
          </a>
          {contactPhone && contact ? (
            <a
              href={`tel:${contactPhone}`}
              className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-center text-[14px] font-bold text-primary-foreground active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transform-none"
              aria-label={`Ligar para contato de emergência ${String(contact.name ?? "").trim() || "cadastrado"}`}
            >
              <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">
                Ligar para {String(contact.name ?? "").trim() || "contato"}
                {contact.relation ? ` · ${String(contact.relation).trim()}` : ""}
              </span>
            </a>
          ) : null}
          {!sent && (
            <button
              type="button"
              disabled={sending}
              onClick={() => void sendAlert()}
              aria-busy={sending}
              className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-[14px] font-bold text-destructive active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive motion-reduce:transform-none"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Shield className="h-4 w-4" aria-hidden="true" />}
              {sending ? "Enviando alerta..." : "Enviar alerta à central APOIS"}
            </button>
          )}
          {!contactLoading && !contactPhone && onOpenContacts && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenContacts();
              }}
              disabled={sending}
              className="min-h-11 rounded-2xl bg-background/60 px-4 py-2.5 text-[13px] font-medium ring-1 ring-border disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Cadastrar contato de emergência
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="min-h-11 rounded-2xl bg-background/60 px-4 py-2.5 text-[13px] ring-1 ring-border disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Fechar
          </button>
        </div>

        <p className="mt-3 text-center text-xs leading-4 text-muted-foreground">
          A APOIS não substitui os serviços de emergência. Em risco imediato, procure o serviço de emergência local.
        </p>
      </div>
    </div>
  );
}
