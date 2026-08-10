/**
 * Smoke test do fluxo de avaliação.
 * Executar:  bun test src/__tests__/ratingFlow.test.ts
 */
import { describe, it, expect, mock } from "bun:test";
import { canSubmitRating, shouldShowRating, type MinimalRide } from "./ratingFlow";

describe("shouldShowRating", () => {
  const ride: MinimalRide = { id: "r1", status: "finalizada" };

  it("mostra para o lado que ainda não avaliou", () => {
    expect(shouldShowRating(ride, "driver", new Set())).toBe(true);
    expect(shouldShowRating(ride, "passenger", new Set())).toBe(true);
  });

  it("não mostra quando a corrida não está finalizada", () => {
    expect(shouldShowRating({ ...ride, status: "em_viagem" }, "driver", new Set())).toBe(false);
  });

  it("não mostra após avaliação local (otimista) ter sido marcada", () => {
    const rated = new Set<string>(["r1"]);
    expect(shouldShowRating(ride, "driver", rated)).toBe(false);
    expect(shouldShowRating(ride, "passenger", rated)).toBe(false);
  });

  it("não mostra quando o lado já avaliou no banco", () => {
    const driverDone: MinimalRide = { ...ride, driver_rated_at: "2026-01-01T00:00:00Z" };
    expect(shouldShowRating(driverDone, "driver", new Set())).toBe(false);
    // mas o passageiro ainda pode avaliar
    expect(shouldShowRating(driverDone, "passenger", new Set())).toBe(true);
  });
});

describe("canSubmitRating", () => {
  it("permite primeiro envio", () => {
    expect(
      canSubmitRating({
        rideId: "r1",
        submitting: false,
        submitted: false,
        ratedLocal: new Set(),
      }),
    ).toBe(true);
  });

  it("bloqueia enquanto envia", () => {
    expect(
      canSubmitRating({
        rideId: "r1",
        submitting: true,
        submitted: false,
        ratedLocal: new Set(),
      }),
    ).toBe(false);
  });

  it("bloqueia após submissão bem-sucedida", () => {
    expect(canSubmitRating({
      rideId: "r1", submitting: false, submitted: true, ratedLocal: new Set(),
    })).toBe(false);
  });

  it("bloqueia se a corrida já consta no cache local de avaliadas", () => {
    expect(canSubmitRating({
      rideId: "r1", submitting: false, submitted: false, ratedLocal: new Set(["r1"]),
    })).toBe(false);
  });
});

describe("fluxo completo do RatingScreen (simulação)", () => {
  it("clique duplo dispara o backend apenas uma vez e avança para a confirmação", async () => {
    // Backend mock: conta quantas vezes foi chamado.
    const backend = mock(async (_args: { rideId: string }) => ({ ok: true }));

    // Estado local equivalente ao do componente.
    const ratedLocal = new Set<string>();
    let submitting = false;
    let submitted = false;
    let error: string | null = null;
    const rideId = "ride-123";

    async function submit() {
      if (!canSubmitRating({ rideId, submitting, submitted, ratedLocal })) return;
      submitting = true;
      error = null;
      try {
        await backend({ rideId });
        ratedLocal.add(rideId);
        submitted = true;
      } catch (e) {
        error = (e as Error).message;
      } finally {
        submitting = false;
      }
    }

    // Dispara dois cliques em paralelo (simula double-tap).
    await Promise.all([submit(), submit()]);
    // Tenta novamente após sucesso (simula Realtime echo).
    await submit();

    expect(backend).toHaveBeenCalledTimes(1);
    expect(submitted).toBe(true);
    expect(error).toBeNull();
    expect(ratedLocal.has(rideId)).toBe(true);

    // Confirmação fecha a tela e não permite reabertura.
    const ride: MinimalRide = {
      id: rideId, status: "finalizada", driver_rated_at: new Date().toISOString(),
    };
    expect(shouldShowRating(ride, "driver", ratedLocal)).toBe(false);
  });

  it("erro do backend mantém a tela aberta e permite retry bem-sucedido", async () => {
    let attempts = 0;
    const backend = mock(async (_args: { rideId: string }) => {
      attempts++;
      if (attempts === 1) throw new Error("Network error");
      return { ok: true };
    });

    const ratedLocal = new Set<string>();
    let submitting = false;
    let submitted = false;
    let error: string | null = null;
    const rideId = "ride-err";

    async function submit() {
      if (!canSubmitRating({ rideId, submitting, submitted, ratedLocal })) return;
      submitting = true;
      error = null;
      try {
        await backend({ rideId });
        ratedLocal.add(rideId);
        submitted = true;
      } catch (e) {
        error = (e as Error).message;
      } finally {
        submitting = false;
      }
    }

    await submit();
    expect(error).toBe("Network error");
    expect(submitted).toBe(false);
    // Tela continua usável: novo envio é permitido.
    expect(canSubmitRating({ rideId, submitting, submitted, ratedLocal })).toBe(true);

    await submit();
    expect(submitted).toBe(true);
    expect(error).toBeNull();
    expect(backend).toHaveBeenCalledTimes(2);
  });
});
