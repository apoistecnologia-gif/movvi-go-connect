import { useEffect, useId, useRef, useState } from "react";
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
const MIN_DESCRIPTION_LENGTH = 10;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CATEGORIES: { id: Category; label: string; description: string; Icon: typeof AlertTriangle }[] = [
  { id: "safety", label: "Problema de segurança", description: "Situação de risco durante a corrida", Icon: ShieldAlert },
  { id: "behavior", label: "Comportamento", description: "Conduta inadequada de motorista ou passageiro", Icon: MessageSquareWarning },
  { id: "route", label: "Problema de rota", description: "Rota inesperada, atraso ou desvio", Icon: MapPinned },
  { id: "payment", label: "Problema de pagamento", description: "Cobrança indevida ou falha no pagamento", Icon: CreditCard },
  { id: "other", label: "Outro", description: "Descreva o que aconteceu", Icon: AlertTriangle },
];

const PASSENGER_CATEGORY_MAP: Record<Category, "ride" | "payment" | "safety" | "other"> = {
  safety: "safety",
  behavior: "ride",
  route: "ride",
  payment: "payment",
  other: "other",
};

type PassengerSupportResponse = {
  ok?: boolean;
  ticket?: { protocol?: string };
};

function categoryLabel(category: Category): string {
  return CATEGORIES.find((item) => item.id === category)?.label ?? "Relato de corrida";
}

export function IncidentReportSheet({ open, onClose, role, rideId }: Props) {
  const [category, setCategory] = useState<Category | null>(null);
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const textareaId = useId();
  const counterId = useId();
  const errorId = useId();

  useEffect(() => {
    if (!open) return;
    setErrorMessage(null);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
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
      window.cancelAnimationFrame(frame);
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
    const normalizedDescription = description.trim().replace(/\s+/g, " ");
    if (normalizedDescription.length < MIN_DESCRIPTION_LENGTH) {
      setErrorMessage(`Descreva o ocorrido com pelo menos ${MIN_DESCRIPTION_LENGTH} caracteres.`);
      return;
    }

    const normalizedRideId = typeof rideId === "string" && UUID_RE.test(rideId.trim()) ? rideId.trim() : null;
    setSending(true);
    setErrorMessage(null);
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth?.user) {
        setErrorMessage("Sua sessão expirou. Entre novamente para enviar o relato.");
        return;
      }

      if (role === "passenger") {
        const { data, error } = await supabase.functions.invoke<PassengerSupportResponse>("passenger-support", {
          body: {
            category: PASSENGER_CATEGORY_MAP[category],
            subject: categoryLabel(category),
            message: normalizedDescription,
            rideId: normalizedRideId || undefined,
          },
        });
        if (error || !data?.ok) throw error ?? new Error("passenger_support_failed");
        toast.success(
          data.ticket?.protocol
            ? `Relato registrado. Protocolo ${data.ticket.protocol}.`
            : "Relato registrado. Nossa equipe vai analisar.",
        );
      } else {
        const { data: profile, error: profileError } = await supabase
          .from("users")
          .select("id")
          .eq("auth_user_id", auth.user.id)
          .maybeSingle();
        if (profileError || !profile?.id) throw profileError ?? new Error("driver_domain_profile_missing");

        const { data: driver, error: driverError } = await supabase
          .from("drivers")
          .select("id")
          .eq("user_id", profile.id)
          .maybeSingle();
        if (driverError || !driver?.id) throw driverError ?? new Error("driver_profile_missing");

        const { error } = await supabase.from("form_submissions").insert({
          kind: "contact",
          consent: true,
          source: "apois-driver-app",
          status: "new",
          payload: {
            channel: "driver_incident_report",
            auth_user_id: auth.user.id,
            domain_user_id: profile.id,
            driver_id: driver.id,
            ride_id: normalizedRideId,
            category,
            subject: categoryLabel(category),
            message: normalizedDescription,
          },
        });
        if (error) throw error;
        toast.success("Relato registrado. Nossa equipe vai analisar.");
      }

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
            ref={closeButtonRef}
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

        <label htmlFor={textareaId} className="mt-4 block text-[12px] font-medium text-muted-foreground">
          Detalhes
        </label>
        <textarea
          id={textareaId}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH));
            setErrorMessage(null);
          }}
          rows={3}
          maxLength={MAX_DESCRIPTION_LENGTH}
          minLength={MIN_DESCRIPTION_LENGTH}
          required
          disabled={sending}
          aria-describedby={errorMessage ? `${counterId} ${errorId}` : counterId}
          aria-invalid={Boolean(errorMessage)}
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
            disabled={!category || description.trim().length < MIN_DESCRIPTION_LENGTH || sending}
            aria-busy={sending}
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-3 py-3 text-[13px] font-bold text-primary-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {sending ? "Enviando…" : "Enviar relato"}
          </button>
        </div>

        <p className="mt-3 text-center text-[12px] leading-4 text-muted-foreground">
          Seu relato é confidencial. Em situação de risco imediato, use o SOS ou procure o serviço de emergência local.
        </p>
      </div>
    </div>
  );
}
