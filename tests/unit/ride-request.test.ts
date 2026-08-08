import { describe, expect, it } from "vitest";
import { parseRideRequest } from "../../supabase/functions/_shared/ride-request";

const base = {
  request_key: "11111111-1111-4111-8111-111111111111",
  category: "carro",
  origin: { lat: -9.39, lng: -40.50, label: "Origem" },
  origin_name: "Origem",
  destination: { lat: -9.40, lng: -40.49, label: "Destino" },
  destination_name: "Destino",
  payment_method: "pix",
};

describe("APOIS canonical RideRequest", () => {
  it("normalizes aliases while preserving server inputs", () => {
    const request = parseRideRequest({
      ...base,
      intermediates: [{ lat: -9.395, lng: -40.495, label: "Parada" }],
      service_details: { ajudantes: "um" },
      pickup_notes: "Portão azul",
    });
    expect(request.category).toBe("carros");
    expect(request.payment_method).toBe("pix");
    expect(request.intermediates).toHaveLength(1);
    expect(request.service_details).toEqual({ ajudantes: "um" });
    expect(request.pickup_notes).toBe("Portão azul");
  });

  it("rejects more than three intermediate stops", () => {
    expect(() => parseRideRequest({
      ...base,
      intermediates: [1, 2, 3, 4].map((n) => ({ lat: -9.39 - n * 0.001, lng: -40.50 + n * 0.001 })),
    })).toThrow("invalid_intermediates");
  });

  it("rejects missing payment instead of silently defaulting", () => {
    const { payment_method: _payment, ...withoutPayment } = base;
    expect(() => parseRideRequest(withoutPayment)).toThrow("payment_method_required");
  });

  it("rejects invalid coordinates", () => {
    expect(() => parseRideRequest({ ...base, origin: { lat: 999, lng: -40 } })).toThrow("invalid_coordinates");
  });

  it("rejects oversized service details", () => {
    expect(() => parseRideRequest({ ...base, service_details: { text: "x".repeat(12_100) } })).toThrow("service_details_too_large");
  });
});
