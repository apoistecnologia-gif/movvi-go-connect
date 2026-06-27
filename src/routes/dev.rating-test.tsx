import { createFileRoute, useNavigate, useLocation } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Star } from "lucide-react";
import { shouldShowRating, canSubmitRating, type RatingSide } from "@/lib/ratingFlow";

/**
 * Harness E2E exclusivamente para Playwright validar o fluxo de avaliação.
 * Não acessa Supabase: simula sucesso/erro via query param `?mode=ok|fail`.
 * Habilitado em qualquer ambiente para permitir CI rodar contra preview.
 */

type Mode = "ok" | "fail";

function StarPicker({
  stars, setStars, disabled,
}: { stars: number; setStars: (n: number) => void; disabled: boolean }) {
  return (
    <div className="flex justify-center gap-2" data-testid="star-picker">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => setStars(n)}
          data-testid={`star-${n}`}
          aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
        >
          <Star
            className={`h-9 w-9 ${n <= stars ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"}`}
          />
        </button>
      ))}
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
  const inFlightRef = useRef(false);
  const submitCountRef = useRef(0);

  const ride = useMemo(
    () => ({ id: rideId, status: "finalizada" as const }),
    [],
  );

  const visible = shouldShowRating(ride, side, ratedLocal);

  async function handleSubmit() {
    if (inFlightRef.current) return;
    if (!canSubmitRating({ rideId, submitting, submitted, ratedLocal })) return;
    inFlightRef.current = true;
    setSubmitting(true);
    setError(null);
    submitCountRef.current += 1;
    setSubmitCount(submitCountRef.current);
    await new Promise((r) => setTimeout(r, 100));
    if (mode === "fail" && submitCountRef.current === 1) {
      setSubmitting(false);
      setError("Falha simulada");
      inFlightRef.current = false;
      return;
    }
    setSubmitting(false);
    setSubmitted(true);
    setRatedLocal((prev) => new Set(prev).add(rideId));
  }

  if (!visible && !submitted) {
    return (
      <div className="p-6" data-testid="rating-hidden">
        Avaliação não disponível.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md p-6" data-testid={`rating-${side}`}>
      <p data-testid="submit-count" className="hidden">{submitCount}</p>

      {submitted ? (
        <div data-testid="rating-confirmation" className="text-center space-y-4">
          <h2 className="text-xl font-bold text-primary">Avaliação registrada</h2>
          <p>Você deu {stars} estrela{stars > 1 ? "s" : ""}.</p>
          <button
            type="button"
            data-testid="finish-button"
            onClick={() => navigate({ to: "/" })}
            className="rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground"
          >
            Concluir
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-center text-lg font-bold">
            Avalie {side === "driver" ? "o passageiro" : "o motorista"}
          </h2>
          <StarPicker stars={stars} setStars={setStars} disabled={submitting} />
          <textarea
            data-testid="comment-input"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Comentário (opcional)"
            className="w-full rounded-xl border border-border bg-background p-3 text-sm"
          />
          {error && (
            <p data-testid="rating-error" className="text-sm text-destructive">{error}</p>
          )}
          <button
            type="button"
            data-testid="submit-button"
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-50"
          >
            {submitting ? "Enviando…" : error ? "Tentar novamente" : "Enviar avaliação"}
          </button>
        </div>
      )}
    </div>
  );
}

function RatingTestPage() {
  const location = useLocation();
  const search = location.searchStr ?? "";
  const side: RatingSide = search.includes("side=driver") ? "driver" : "passenger";
  const mode = search.includes("mode=fail") ? "fail" : "ok";
  // key forces remount on side/mode change so internal state resets
  return (
    <div className="min-h-screen bg-background text-foreground">
      <RatingHarness key={`${side}-${mode}`} side={side} mode={mode} />
    </div>
  );
}

export const Route = createFileRoute("/dev/rating-test")({
  ssr: false,
  head: () => ({ meta: [{ title: "Rating Test Harness — MOVVI" }] }),
  component: RatingTestPage,
});
