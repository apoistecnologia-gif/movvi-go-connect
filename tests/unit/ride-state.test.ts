import { describe, expect, it } from "vitest";
import { canTransitionRide, isTerminalRideStatus } from "../../supabase/functions/_shared/ride-state";

describe("APOIS canonical ride state machine", () => {
  it("accepts the valid main lifecycle", () => {
    expect(canTransitionRide("agendada", "procurar_motorista", "system")).toBe(true);
    expect(canTransitionRide("procurar_motorista", "motorista_a_caminho", "driver", { hasValidOffer: true })).toBe(true);
    expect(canTransitionRide("motorista_a_caminho", "motorista_chegou", "driver")).toBe(true);
    expect(canTransitionRide("motorista_chegou", "em_viagem", "driver", { pinVerified: true })).toBe(true);
    expect(canTransitionRide("em_viagem", "finalizada", "driver")).toBe(true);
  });

  it("rejects accepting without a valid offer", () => {
    expect(canTransitionRide("procurar_motorista", "motorista_a_caminho", "driver", { hasValidOffer: false })).toBe(false);
  });

  it("rejects ride start without verified PIN", () => {
    expect(canTransitionRide("motorista_chegou", "em_viagem", "driver", { pinVerified: false })).toBe(false);
  });

  it("never treats no-driver timeout as passenger cancellation", () => {
    expect(canTransitionRide("procurar_motorista", "expired", "system")).toBe(true);
    expect(canTransitionRide("procurar_motorista", "cancelada_passageiro", "system")).toBe(false);
  });

  it("blocks passenger cancellation after driver arrival", () => {
    expect(canTransitionRide("motorista_chegou", "cancelada_passageiro", "passenger", { cancellationAllowed: true })).toBe(false);
    expect(canTransitionRide("em_viagem", "cancelada_passageiro", "passenger", { cancellationAllowed: true })).toBe(false);
  });

  it("does not transition out of terminal states", () => {
    expect(isTerminalRideStatus("finalizada")).toBe(true);
    expect(canTransitionRide("finalizada", "procurar_motorista", "admin")).toBe(false);
  });
});
