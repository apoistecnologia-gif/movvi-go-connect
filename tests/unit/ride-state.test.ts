/* global Deno */
import { canTransitionRide, isTerminalRideStatus } from "../../supabase/functions/_shared/ride-state.ts";

function assertEquals(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

Deno.test("ride state: accepts valid main lifecycle", () => {
  assertEquals(canTransitionRide("agendada", "procurar_motorista", "system"), true, "scheduled search");
  assertEquals(canTransitionRide("procurar_motorista", "motorista_a_caminho", "driver", { hasValidOffer: true }), true, "accept");
  assertEquals(canTransitionRide("motorista_a_caminho", "motorista_chegou", "driver"), true, "arrival");
  assertEquals(canTransitionRide("motorista_chegou", "em_viagem", "driver", { pinVerified: true }), true, "start");
  assertEquals(canTransitionRide("em_viagem", "finalizada", "driver"), true, "finish");
});

Deno.test("ride state: rejects acceptance without valid offer", () => {
  assertEquals(canTransitionRide("procurar_motorista", "motorista_a_caminho", "driver", { hasValidOffer: false }), false, "invalid offer");
});

Deno.test("ride state: rejects start without verified PIN", () => {
  assertEquals(canTransitionRide("motorista_chegou", "em_viagem", "driver", { pinVerified: false }), false, "pin gate");
});

Deno.test("ride state: no-driver timeout is not passenger cancellation", () => {
  assertEquals(canTransitionRide("procurar_motorista", "expired", "system"), true, "system expiration");
  assertEquals(canTransitionRide("procurar_motorista", "cancelada_passageiro", "system"), false, "system cannot impersonate passenger cancellation");
});

Deno.test("ride state: blocks passenger cancellation after Driver arrival", () => {
  assertEquals(canTransitionRide("motorista_chegou", "cancelada_passageiro", "passenger", { cancellationAllowed: true }), false, "after arrival");
  assertEquals(canTransitionRide("em_viagem", "cancelada_passageiro", "passenger", { cancellationAllowed: true }), false, "in progress");
});

Deno.test("ride state: terminal states do not transition", () => {
  assertEquals(isTerminalRideStatus("finalizada"), true, "terminal");
  assertEquals(canTransitionRide("finalizada", "procurar_motorista", "admin"), false, "no transition after finish");
});
