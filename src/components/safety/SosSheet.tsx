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
  counterpartLabel?: string;
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
        setContact(await getPrimaryContact(role, data.user.id));
      } catch {
        setContact(null);
      }
    })();
  }, [open, role]);

  async function sendAlert() {
    if (sending) return;
    setSending(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) throw new Error("Sessão expirada");
      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("id")
        .eq("auth_user_id", auth.user.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile) throw new Error("Perfil operacional não encontrado");

      let driverId: string | null = null;
      if (role === "driver") {
        const { data: driver, error: driverError } = await supabase
          .from("drivers")
          .select("id")
          .eq("user_id", profile.id)
          .maybeSingle();
        if (driverError) throw driverError;
        driverId = driver?.id ?? null;
      }

      const pos = await getApproxLocation();
      const context = [rideId ? `corrida=${rideId}` : null, counterpartLabel].filter(Boolean).join(" · ");
      const { error } = await supabase.from("sos_alerts").insert({
        user_id: profile.id,
        driver_id: driverId,
        lat: pos?.lat ?? null,
        lng: pos?.lng ?? null,
        message: `Alerta SOS (${role})${context ? ` · ${context}` : ""}`,
      });
      if (error) throw error;
      setSent(true);
      toast.success("Alerta SOS enviado à central APOIS");
    } catch (err) {
      console.error("[APOIS] SOS", err);
      toast.error("Não foi possível enviar o alerta. Em risco imediato, ligue 190.");
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/70 backdrop-blur-sm animate-in fade-in" onClick={() => !sending && onClose()}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-t-3xl bg-card p-5 ring-1 ring-destructive/40 animate-in slide-in-from-bottom">
        <div className="mx-auto -mt-1 mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" />
        <div className="mb-3 flex items-center gap-2">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-destructive/15 text-destructive ring-1 ring-destructive/30"><Shield className="h-5 w-5" /></div>
          <div className="min-w-0"><div className="text-[15px] font-extrabold">Emergência durante a corrida</div><div className="truncate text-[12px] text-muted-foreground">Use apenas em caso real de risco.</div></div>
          <button onClick={() => !sending && onClose()} className="ml-auto rounded-full p-1.5 text-muted-foreground hover:bg-muted/40" aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
        {sent ? <div className="rounded-2xl bg-primary/10 p-3 text-[13px] ring-1 ring-primary/30">✅ Alerta enviado. A central recebeu sua localização e o contexto disponível. Mantenha-se em local seguro.</div> : <p className="text-[13px] text-muted-foreground">A APOIS registrará sua localização atual e o contexto disponível da corrida para atendimento operacional.{counterpartLabel ? ` (${counterpartLabel})` : ""}</p>}
        <div className="mt-4 grid gap-2">
          <a href="tel:190" className="flex items-center justify-center gap-2 rounded-2xl bg-destructive py-3.5 text-[14px] font-bold text-destructive-foreground active:scale-[0.98]"><Phone className="h-4 w-4" /> Ligar 190 — Polícia</a>
          {contact?.phone && <a href={`tel:${contact.phone.replace(/\D/g, "")}`} className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-[14px] font-bold text-primary-foreground active:scale-[0.98]"><Phone className="h-4 w-4" /> Ligar para {contact.name}{contact.relation ? ` · ${contact.relation}` : ""}</a>}
          {!sent && <button disabled={sending} onClick={sendAlert} className="flex items-center justify-center gap-2 rounded-2xl border border-destructive/50 bg-destructive/10 py-3 text-[14px] font-bold text-destructive-foreground active:scale-[0.98] disabled:opacity-50">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}{sending ? "Enviando alerta..." : "Enviar alerta à central APOIS"}</button>}
          {!contact && onOpenContacts && <button onClick={onOpenContacts} className="rounded-2xl bg-background/60 py-2.5 text-[13px] font-medium ring-1 ring-border">Cadastrar contato de emergência</button>}
          <button onClick={onClose} disabled={sending} className="rounded-2xl bg-background/60 py-2.5 text-[13px] ring-1 ring-border">Fechar</button>
        </div>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">A APOIS não substitui os serviços de emergência. Em risco imediato, ligue 190.</p>
      </div>
    </div>
  );
}
