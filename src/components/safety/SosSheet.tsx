import { useEffect, useState } from "react";
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
  counterpartLabel?: string; // e.g. "Motorista João · ABC1D23"
  onOpenContacts?: () => void;
}

export function SosSheet({ open, onClose, role, rideId, counterpartLabel, onOpenContacts }: Props) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [contact, setContact] = useState<EmergencyContact | null>(null);

  useEffect(() => {
    if (!open) return;
    setSent(false);
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data?.user) return;
        const c = await getPrimaryContact(role, data.user.id);
        setContact(c);
      } catch {
        /* ignore */
      }
    })();
  }, [open, role]);

  async function sendAlert() {
    if (sending) return;
    setSending(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) throw new Error("Sessão expirada");
      const pos = await getApproxLocation();
      const { error } = await supabase.from("sos_alerts").insert({
        user_id: auth.user.id,
        ride_id: rideId ?? null,
        lat: pos?.lat ?? null,
        lng: pos?.lng ?? null,
        message: `Alerta SOS (${role}) ${counterpartLabel ?? ""}`.trim(),
      });
      if (error) throw error;
      setSent(true);
      toast.success("Alerta SOS enviado à central MOVVI");
    } catch (err) {
      console.error("[MOVVI] SOS", err);
      toast.error("Não foi possível enviar. Ligue 190 imediatamente.");
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[220] flex items-end justify-center bg-black/70 backdrop-blur-sm animate-in fade-in"
      onClick={() => !sending && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl bg-card p-5 ring-1 ring-destructive/40 animate-in slide-in-from-bottom"
      >
        <div className="mx-auto -mt-1 mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" />

        <div className="mb-3 flex items-center gap-2">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-destructive/15 text-destructive ring-1 ring-destructive/30">
            <Shield className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-extrabold">Emergência durante a corrida</div>
            <div className="truncate text-[12px] text-muted-foreground">
              Use apenas em caso real de risco.
            </div>
          </div>
          <button
            onClick={() => !sending && onClose()}
            className="ml-auto rounded-full p-1.5 text-muted-foreground hover:bg-muted/40"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {sent ? (
          <div className="rounded-2xl bg-primary/10 p-3 text-[13px] ring-1 ring-primary/30">
            ✅ Alerta enviado. A central recebeu sua localização e os dados da corrida. Mantenha-se em local seguro.
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            Vamos registrar sua localização atual e os dados da corrida para acionamento da central MOVVI.
            {counterpartLabel ? ` (${counterpartLabel})` : ""}
          </p>
        )}

        <div className="mt-4 grid gap-2">
          <a
            href="tel:190"
            className="flex items-center justify-center gap-2 rounded-2xl bg-destructive py-3.5 text-[14px] font-bold text-destructive-foreground active:scale-[0.98]"
          >
            <Phone className="h-4 w-4" /> Ligar 190 — Polícia
          </a>
          {contact?.phone && (
            <a
              href={`tel:${contact.phone.replace(/\D/g, "")}`}
              className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-[14px] font-bold text-primary-foreground active:scale-[0.98]"
            >
              <Phone className="h-4 w-4" /> Ligar para {contact.name}
              {contact.relation ? ` · ${contact.relation}` : ""}
            </a>
          )}
          {!sent && (
            <button
              disabled={sending}
              onClick={sendAlert}
              className="flex items-center justify-center gap-2 rounded-2xl border border-destructive/50 bg-destructive/10 py-3 text-[14px] font-bold text-destructive-foreground active:scale-[0.98] disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
              {sending ? "Enviando alerta..." : "Enviar alerta à central MOVVI"}
            </button>
          )}
          {!contact && onOpenContacts && (
            <button
              onClick={onOpenContacts}
              className="rounded-2xl bg-background/60 py-2.5 text-[13px] font-medium ring-1 ring-border"
            >
              Cadastrar contato de emergência
            </button>
          )}
          <button
            onClick={onClose}
            disabled={sending}
            className="rounded-2xl bg-background/60 py-2.5 text-[13px] ring-1 ring-border"
          >
            Fechar
          </button>
        </div>

        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          A MOVVI não substitui os serviços de emergência. Em risco imediato, ligue 190.
        </p>
      </div>
    </div>
  );
}
