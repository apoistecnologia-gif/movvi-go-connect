import { useState } from "react";
import { AlertTriangle, ShieldAlert, MapPinned, CreditCard, MessageSquareWarning, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { SafetyRole } from "@/lib/safety/emergencyContacts";

interface Props {
  open: boolean;
  onClose: () => void;
  role: SafetyRole;
  rideId?: string | null;
}

type Category = "safety" | "behavior" | "route" | "payment" | "other";

const CATEGORIES: { id: Category; label: string; description: string; Icon: typeof AlertTriangle }[] = [
  { id: "safety", label: "Problema de segurança", description: "Situação de risco durante a corrida", Icon: ShieldAlert },
  { id: "behavior", label: "Comportamento", description: "Conduta inadequada de motorista ou passageiro", Icon: MessageSquareWarning },
  { id: "route", label: "Problema de rota", description: "Rota inesperada, atraso ou desvio", Icon: MapPinned },
  { id: "payment", label: "Problema de pagamento", description: "Cobrança indevida ou falha no pagamento", Icon: CreditCard },
  { id: "other", label: "Outro", description: "Descreva o que aconteceu", Icon: AlertTriangle },
];

export function IncidentReportSheet({ open, onClose, role, rideId }: Props) {
  const [category, setCategory] = useState<Category | null>(null);
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);

  function close() {
    if (sending) return;
    setCategory(null);
    setDescription("");
    onClose();
  }

  async function submit() {
    if (!category || sending) return;
    setSending(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) throw new Error("Sessão expirada");
      const client = supabase as unknown as {
        from: (t: string) => { insert: (row: unknown) => Promise<{ error: { message: string } | null }> };
      };
      const { error } = await client.from("incident_reports").insert({
        user_id: auth.user.id,
        role,
        ride_id: rideId ?? null,
        category,
        description: description.trim() || null,
      });
      if (error) throw new Error(error.message);
      toast.success("Denúncia registrada. Nossa equipe vai analisar.");
      close();
    } catch (err) {
      console.error("[MOVVI] incident", err);
      toast.error("Não foi possível registrar. Tente novamente.");
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[220] flex items-end justify-center bg-black/70 backdrop-blur-sm animate-in fade-in"
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl bg-card p-5 ring-1 ring-border animate-in slide-in-from-bottom"
      >
        <div className="mx-auto -mt-1 mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" />

        <div className="mb-3 flex items-center gap-2">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/30">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-extrabold">Reportar problema</div>
            <div className="text-[12px] text-muted-foreground">Selecione a categoria</div>
          </div>
          <button onClick={close} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted/40" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-2">
          {CATEGORIES.map(({ id, label, description: desc, Icon }) => (
            <button
              key={id}
              onClick={() => setCategory(id)}
              className={`flex items-start gap-3 rounded-2xl p-3 text-left ring-1 transition ${
                category === id
                  ? "bg-primary/10 ring-primary/50"
                  : "bg-background/60 ring-border hover:bg-background/80"
              }`}
            >
              <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-background ring-1 ring-border text-foreground">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold">{label}</div>
                <div className="text-[11.5px] text-muted-foreground">{desc}</div>
              </div>
            </button>
          ))}
        </div>

        <label className="mt-4 block text-[11.5px] font-medium text-muted-foreground">
          Detalhes (opcional)
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 1000))}
          rows={3}
          placeholder="Conte o que aconteceu…"
          className="mt-1 w-full resize-none rounded-2xl bg-background/70 p-3 text-[13px] ring-1 ring-border outline-none focus:ring-2 focus:ring-primary"
        />

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={close}
            disabled={sending}
            className="rounded-2xl bg-muted/40 py-3 text-[13px] font-semibold ring-1 ring-border disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!category || sending}
            className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-[13px] font-bold text-primary-foreground disabled:opacity-50"
          >
            {sending && <Loader2 className="h-4 w-4 animate-spin" />}
            Enviar
          </button>
        </div>

        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Sua denúncia é confidencial. Casos de emergência exigem ligação para 190.
        </p>
      </div>
    </div>
  );
}
