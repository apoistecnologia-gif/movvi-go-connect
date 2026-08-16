import { useEffect, useId, useState } from "react";
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

const MAX_DESCRIPTION_LENGTH = 1000;

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const counterId = useId();
  const errorId = useId();

  useEffect(() => {
    if (!open) return;
    setErrorMessage(null);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !sending) {
        setCategory(null);
        setDescription("");
        setErrorMessage(null);
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose, sending]);

  function close() {
    if (sending) return;
    setCategory(null);
    setDescription("");
    setErrorMessage(null);
    onClose();
  }

  async function submit() {
    if (!category || sending) return;
    setSending(true);
    setErrorMessage(null);
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth?.user) {
        setErrorMessage("Sua sessão expirou. Entre novamente para enviar o relato.");
        return;
      }
      const client = supabase as unknown as {
        from: (t: string) => { insert: (row: unknown) => Promise<{ error: { message: string } | null }> };
      };
      const normalizedRideId = typeof rideId === "string" && rideId.trim() ? rideId.trim() : null;
      const normalizedDescription = description.trim();
      const { error } = await client.from("incident_reports").insert({
        user_id: auth.user.id,
        role,
        ride_id: normalizedRideId,
        category,
        description: normalizedDescription || null,
      });
      if (error) throw new Error(error.message);
      toast.success("Relato registrado. Nossa equipe vai analisar.");
      setCategory(null);
      setDescription("");
      setErrorMessage(null);
      onClose();
    } catch (err) {
      if (import.meta.env.DEV) console.error("[APOIS] incident", err);
      setErrorMessage("Não foi possível registrar o relato agora. Verifique sua conexão e tente novamente.");
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[220] flex items-end justify-center bg-black/70 backdrop-blur-sm animate-in fade-in motion-reduce:animate-none"
      onClick={close}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[calc(100dvh-env(safe-area-inset-top)-12px)] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-5 ring-1 ring-border animate-in slide-in-from-bottom motion-reduce:animate-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={errorMessage ? `${descriptionId} ${errorId}` : descriptionId}
      >
        <div className="mx-auto -mt-1 mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden="true" />

        <div className="mb-3 flex items-center gap-2">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/30" aria-hidden="true">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div id={titleId} className="break-words text-[15px] font-extrabold">Reportar problema</div>
            <div id={descriptionId} className="text-[12px] text-muted-foreground">Selecione a categoria e descreva o que aconteceu.</div>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={sending}
            className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Fechar relato"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="grid gap-2" role="group" aria-label="Categoria do problema">
          {CATEGORIES.map(({ id, label, description: desc, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setCategory(id);
                setErrorMessage(null);
              }}
              disabled={sending}
              aria-pressed={category === id}
              className={`flex min-h-14 items-start gap-3 rounded-2xl p-3 text-left ring-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60 ${
                category === id
                  ? "bg-primary/10 ring-primary/50"
                  : "bg-background/60 ring-border hover:bg-background/80"
              }`}
            >
              <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-background text-foreground ring-1 ring-border" aria-hidden="true">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="break-words text-[13px] font-semibold">{label}</div>
                <div className="break-words text-[12px] leading-4 text-muted-foreground">{desc}</div>
              </div>
            </button>
          ))}
        </div>

        <label htmlFor="incident-description" className="mt-4 block text-[12px] font-medium text-muted-foreground">
          Detalhes (opcional)
        </label>
        <textarea
          id="incident-description"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH));
            setErrorMessage(null);
          }}
          rows={3}
          maxLength={MAX_DESCRIPTION_LENGTH}
          disabled={sending}
          aria-describedby={counterId}
          placeholder="Conte o que aconteceu…"
          className="mt-1 min-h-24 w-full resize-y rounded-2xl bg-background/70 p-3 text-[16px] leading-5 ring-1 ring-border outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
        />
        <p id={counterId} className="mt-1 text-right text-[12px] tabular-nums text-muted-foreground" aria-live="polite">
          {description.length}/{MAX_DESCRIPTION_LENGTH}
        </p>

        {errorMessage ? (
          <p id={errorId} role="alert" className="mt-3 break-words rounded-xl bg-destructive/10 px-3 py-2 text-[13px] leading-5 text-destructive ring-1 ring-destructive/25">
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2 max-[339px]:grid-cols-1">
          <button
            type="button"
            onClick={close}
            disabled={sending}
            className="min-h-12 rounded-2xl bg-muted/40 px-3 py-3 text-[13px] font-semibold ring-1 ring-border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!category || sending}
            aria-busy={sending}
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-3 py-3 text-[13px] font-bold text-primary-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {sending ? "Enviando…" : "Enviar relato"}
          </button>
        </div>

        <p className="mt-3 text-center text-[12px] leading-4 text-muted-foreground">
          Seu relato é confidencial. Em situação de risco imediato, ligue 190.
        </p>
      </div>
    </div>
  );
}
