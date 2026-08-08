/* global Deno */
import {
  findEligibleDriversForRide,
  type DispatchDriver,
  type DispatchRide,
} from "../../supabase/functions/_shared/dispatch-engine.ts";

const NOW = Date.parse("2026-08-08T17:00:00Z");

function driver(overrides: Partial<DispatchDriver> = {}): DispatchDriver {
  return {
    id: crypto.randomUUID(),
    user_id: crypto.randomUUID(),
    category: "carros",
    is_online: true,
    approval_status: "aprovado",
    subscription_status: "teste",
    current_lat: -9.39,
    current_lng: -40.50,
    last_location_at: new Date(NOW - 30_000).toISOString(),
    ...overrides,
  };
}

function ride(overrides: Partial<DispatchRide> = {}): DispatchRide {
  return {
    id: crypto.randomUUID(),
    category: "carros",
    origin_lat: -9.391,
    origin_lng: -40.501,
    candidate_driver_ids: [],
    offered_driver_ids: [],
    rejected_driver_ids: [],
    ...overrides,
  };
}

function assert(condition: boolean, label: string): void {
  if (!condition) throw new Error(label);
}

Deno.test("dispatch: filters approval, online, subscription, category and fresh GPS", () => {
  const ok = driver({ user_id: "11111111-1111-4111-8111-111111111111" });
  const offline = driver({ user_id: "22222222-2222-4222-8222-222222222222", is_online: false });
  const stale = driver({ user_id: "33333333-3333-4333-8333-333333333333", last_location_at: new Date(NOW - 300_000).toISOString() });
  const wrongCategory = driver({ user_id: "44444444-4444-4444-8444-444444444444", category: "motos" });
  const inactive = driver({ user_id: "55555555-5555-4555-8555-555555555555", subscription_status: "inativa" });
  const result = findEligibleDriversForRide({
    ride: ride(),
    drivers: [ok, offline, stale, wrongCategory, inactive],
    activeRides: [],
    queuedDriverIds: [],
    options: { nowMs: NOW },
  });
  assert(result.offeredUserIds.length === 1, "only one driver should be offered");
  assert(result.offeredUserIds[0] === ok.user_id, "eligible Driver should receive the offer");
});

Deno.test("dispatch: does not offer a Driver heading to another pickup", () => {
  const busy = driver({ user_id: "11111111-1111-4111-8111-111111111111" });
  const result = findEligibleDriversForRide({
    ride: ride(),
    drivers: [busy],
    activeRides: [{ id: crypto.randomUUID(), driver_id: busy.id, status: "motorista_a_caminho", destination_lat: -9.4, destination_lng: -40.5 }],
    queuedDriverIds: [],
    options: { nowMs: NOW },
  });
  assert(result.offeredUserIds.length === 0, "busy Driver must not receive offer");
});

Deno.test("dispatch: may offer next ride only near the active ride destination", () => {
  const near = driver({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", user_id: "11111111-1111-4111-8111-111111111111" });
  const far = driver({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", user_id: "22222222-2222-4222-8222-222222222222" });
  const result = findEligibleDriversForRide({
    ride: ride(),
    drivers: [near, far],
    activeRides: [
      { id: crypto.randomUUID(), driver_id: near.id, status: "em_viagem", destination_lat: -9.392, destination_lng: -40.502 },
      { id: crypto.randomUUID(), driver_id: far.id, status: "em_viagem", destination_lat: -8.0, destination_lng: -40.0 },
    ],
    queuedDriverIds: [],
    options: { nowMs: NOW, nextRideRadiusKm: 5 },
  });
  assert(result.offeredUserIds.includes(near.user_id), "near next-ride Driver should be offered");
  assert(!result.offeredUserIds.includes(far.user_id), "far next-ride Driver should not be offered");
});

Deno.test("dispatch: excludes Driver that already has a queued next ride", () => {
  const queued = driver({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", user_id: "11111111-1111-4111-8111-111111111111" });
  const result = findEligibleDriversForRide({
    ride: ride(),
    drivers: [queued],
    activeRides: [{ id: crypto.randomUUID(), driver_id: queued.id, status: "em_viagem", destination_lat: -9.392, destination_lng: -40.502 }],
    queuedDriverIds: [queued.id],
    options: { nowMs: NOW },
  });
  assert(result.offeredUserIds.length === 0, "Driver with queued ride should be excluded");
});

Deno.test("dispatch: separates current offers from remaining candidates", () => {
  const drivers = Array.from({ length: 7 }, (_, index) => driver({
    id: `00000000-0000-4000-8000-0000000000${String(index + 10).slice(-2)}`,
    user_id: `10000000-0000-4000-8000-0000000000${String(index + 10).slice(-2)}`,
    current_lat: -9.391 - index * 0.001,
  }));
  const result = findEligibleDriversForRide({
    ride: ride(),
    drivers,
    activeRides: [],
    queuedDriverIds: [],
    options: { nowMs: NOW, maxOffers: 5, radiiKm: [50] },
  });
  assert(result.offeredUserIds.length === 5, "five Drivers should be offered");
  assert(result.remainingCandidateUserIds.length === 2, "remaining candidates should be kept separately");
  assert(result.offeredUserIds.every((id) => !result.remainingCandidateUserIds.includes(id)), "offer and remaining pools must not overlap");
});

Deno.test("dispatch: redispatch uses only the persisted remaining pool", () => {
  const first = driver({ user_id: "11111111-1111-4111-8111-111111111111" });
  const second = driver({ user_id: "22222222-2222-4222-8222-222222222222", current_lat: -9.40 });
  const result = findEligibleDriversForRide({
    ride: ride({ offered_driver_ids: [first.user_id], candidate_driver_ids: [second.user_id] }),
    drivers: [first, second],
    activeRides: [],
    queuedDriverIds: [],
    options: { nowMs: NOW, remainingPoolUserIds: [second.user_id], radiiKm: [50] },
  });
  assert(result.offeredUserIds.length === 1, "one remaining Driver should be offered");
  assert(result.offeredUserIds[0] === second.user_id, "redispatch must not reoffer timed-out Driver");
});
