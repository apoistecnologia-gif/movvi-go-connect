/* global Deno */
import { parseRideRequest } from "../../supabase/functions/_shared/ride-request.ts";

const base = {
  request_key: "11111111-1111-4111-8111-111111111111",
  category: "carro",
  origin: { lat: -9.39, lng: -40.50, label: "Origem" },
  origin_name: "Origem",
  destination: { lat: -9.40, lng: -40.49, label: "Destino" },
  destination_name: "Destino",
  payment_method: "pix",
};

function assertEquals(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertThrows(fn: () => unknown, includes: string): void {
  try {
    fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(includes)) return;
    throw new Error(`expected ${includes}, got ${message}`);
  }
  throw new Error(`expected function to throw ${includes}`);
}

Deno.test("RideRequest: normalizes aliases and preserves server inputs", () => {
  const request = parseRideRequest({
    ...base,
    intermediates: [{ lat: -9.395, lng: -40.495, label: "Parada" }],
    service_details: { ajudantes: "um" },
    pickup_notes: "Portão azul",
  });
  assertEquals(request.category, "carros", "category");
  assertEquals(request.payment_method, "pix", "payment");
  assertEquals(request.intermediates.length, 1, "stops");
  assertEquals(request.service_details, { ajudantes: "um" }, "service details");
  assertEquals(request.pickup_notes, "Portão azul", "pickup notes");
});

Deno.test("RideRequest: rejects more than three intermediate stops", () => {
  assertThrows(() => parseRideRequest({
    ...base,
    intermediates: [1, 2, 3, 4].map((n) => ({ lat: -9.39 - n * 0.001, lng: -40.50 + n * 0.001 })),
  }), "invalid_intermediates");
});

Deno.test("RideRequest: rejects missing payment instead of defaulting", () => {
  const { payment_method: _payment, ...withoutPayment } = base;
  assertThrows(() => parseRideRequest(withoutPayment), "payment_method_required");
});

Deno.test("RideRequest: rejects invalid coordinates", () => {
  assertThrows(() => parseRideRequest({ ...base, origin: { lat: 999, lng: -40 } }), "invalid_coordinates");
});

Deno.test("RideRequest: rejects oversized service details", () => {
  assertThrows(() => parseRideRequest({ ...base, service_details: { text: "x".repeat(12_100) } }), "service_details_too_large");
});
