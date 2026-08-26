import { createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Star } from "lucide-react";
import { DevOrAdminGuard } from "@/components/DevOrAdminGuard";
import { shouldShowRating, canSubmitRating, type RatingSide } from "@/lib/ratingFlow";
import { isDevelopmentEnvironment } from "@/lib/environment";

/**
 * Harness E2E exclusivamente para validar o fluxo de avaliação em ambiente
 * de desenvolvimento confiável. Não acessa Supabase: simula sucesso/erro via
 * query param `?mode=ok|fail`.
 */

type Mode = "ok" | "fail";

function StarPicker({
  stars,
  setStars,
  disabled,
}: {
  stars: number;
  setStars: (n: number) => void;
  disabled: boolean;
}) {
  return (
    <div
      className="flex flex-wrap justify-center gap-2"
      data-testid="star-picker"
      role="radiogroup"
      aria-label="Nota da avaliação"
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const selected = n === stars;
        return (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => setStars(n)}
            data-testid={`star-${n}`}
            role="radio"
            aria-checked={selected}
            aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none"
          >
            <Star
              className={`h-8 w-8 ${n <= stars ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"}`}
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );
}

function RatingHarness({ side, mode }: { side: RatingSide; mode: Mode }) {
  const navigate = useNavigate();
  const rideId = "test-ride-1";
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratedLocal, setRatedLocal] = useState<Set<string>>(new Set());
  const [submitCount, setSubmitCount] = useState(0);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const submitCountRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      inFlightRef.current = false;
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const ride = useMemo(() => ({ id: rideId, status: "finalizada" as const }), []);
  const visible = shouldShowRating(ride, side, ratedLocal);

  async function handleSubmit() {
    if (inFlightRef.current) return;
    if (!canSubmitRating({ rideId, submitting, submitted, ratedLocal })) return;
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      setError("Selecione uma nota de 1 a 5 estrelas.");
      return;
    }

    inFlightRef.current = true;
    setSubmitting(true);
    setError(null);
    submitCountRef.current += 1;
    setSubmitCount(submitCountRef.current);

    await new Promise<void>((resolve) => {
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        resolve();
      }, 100);
    });
    if (!aliveRef.current) return;

    if (mode === "fail" && submitCountRef.current === 1) {
      setSubmitting(false);
      setError("Falha simulada");
      inFlightRef.current = false;
      return;
    }

    setSubmitting(false);
    setSubmitted(true);
    setRatedLocal((prev) => new Set(prev).add(rideId));
    inFlightRef.current = false;
  }

  async function finish() {
    if (navigationError) setNavigationError(null);
    try {
      await navigate({ to: "/", replace: true });
    } catch (cause) {
      if (!aliveRef.current) return;
      setNavigationError("Não foi possível voltar ao início.");
      if (import.meta.env.DEV) console.warn("[APOIS Rating Harness] falha ao navegar", cause);
    }
  }

  if (!visible && !submitted) {
    return (
      <div className="p-6 text-sm text-muted-foreground" data-testid="rating-hidden" role="status">
        Avaliação não disponível.
      </div>
    );
  }

  return (
    <main
      className="mx-auto min-w-0 max-w-md px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:p-6"
      data-testid={`rating-${side}`}
    >
      <p data-testid="submit-count" className="sr-only" aria-live="polite">
        Tentativas de envio: {submitCount}
      </p>

      {submitted ? (
        <section data-testid="rating-confirmation" className="space-y-4 text-center" aria-labelledby="rating-confirmation-title">
          <h1 id="rating-confirmation-title" className="text-xl font-bold text-primary">
            Avaliação registrada
          </h1>
          <p className="text-sm leading-6">
            Você deu {stars} estrela{stars > 1 ? "s" : ""}.
          </p>
          {navigationError ? (
            <p className="text-sm text-destructive" role="alert">
              {navigationError}
            </p>
          ) : null}
          <button
            type="button"
            data-testid="finish-button"
            onClick={() => void finish()}
            className="min-h-11 rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Concluir
          </button>
        </section>
      ) : (
        <section className="space-y-4" aria-labelledby="rating-title">
          <h1 id="rating-title" className="text-center text-lg font-bold">
            Avalie {side === "driver" ? "o passageiro" : "o motorista"}
          </h1>
          <StarPicker stars={stars} setStars={setStars} disabled={submitting} />
          <label className="grid gap-1 text-sm font-medium" htmlFor="rating-comment">
            Comentário opcional
            <textarea
              id="rating-comment"
              data-testid="comment-input"
              value={comment}
              onChange={(event) => {
                setComment(event.target.value.slice(0, 500));
                setError(null);
              }}
              maxLength={500}
              rows={4}
              disabled={submitting}
              placeholder="Comentário (opcional)"
              className="min-h-24 w-full resize-y rounded-xl border border-border bg-background p-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
            />
            <span className="text-xs text-muted-foreground">{comment.length}/500 caracteres</span>
          </label>
          {error ? (
            <p data-testid="rating-error" className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            data-testid="submit-button"
            onClick={() => void handleSubmit()}
            disabled={submitting || submitted}
            aria-busy={submitting}
            className="flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : null}
            {submitting ? "Enviando…" : error ? "Tentar novamente" : "Enviar avaliação"}
          </button>
        </section>
      )}
    </main>
  );
}

function RatingTestPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const allowed = isDevelopmentEnvironment();

  useEffect(() => {
    if (!allowed) {
      void navigate({ to: "/", replace: true }).catch((error) => {
        if (import.meta.env.DEV) console.warn("[APOIS Rating Harness] falha ao redirecionar", error);
      });
    }
  }, [allowed, navigate]);

  if (!allowed) return null;
  const search = String(location.searchStr ?? "").slice(0, 500);
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const side: RatingSide = params.get("side") === "driver" ? "driver" : "passenger";
  const mode: Mode = params.get("mode") === "fail" ? "fail" : "ok";

  return (
    <div className="min-h-dvh min-w-0 overflow-x-hidden bg-background text-foreground">
      <RatingHarness key={`${side}-${mode}`} side={side} mode={mode} />
    </div>
  );
}

export const Route = createFileRoute("/dev/rating-test")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Rating Test Harness — APOIS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <DevOrAdminGuard>
      <RatingTestPage />
    </DevOrAdminGuard>
  ),
});
