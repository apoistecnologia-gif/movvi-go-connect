/**
 * APOIS — Live tracking link helpers.
 * Builds the public /t/{token} URL a passenger can share so anyone
 * (no login) can watch the ride in real time in a browser.
 */
import { supabase } from "@/integrations/supabase/client";
import type { SafetyRole } from "@/lib/safety/emergencyContacts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireUuid(value: unknown, field: string): string {
  const normalized = String(value ?? "").trim();
  if (!UUID_RE.test(normalized)) throw new Error(`${field}_invalid`);
  return normalized;
}

export function buildTrackingUrl(token: string): string {
  const safeToken = requireUuid(token, "share_token");
  const path = `/t/${encodeURIComponent(safeToken)}`;
  if (typeof window !== "undefined" && /^https?:$/.test(window.location.protocol)) {
    return new URL(path, window.location.origin).toString();
  }
  return path;
}

/**
 * Creates/reuses the audited passenger share token through the canonical RPC.
 * Driver sharing must never reuse the passenger's private share token; it falls
 * back to the driver's approximate location in shareRide().
 */
export async function ensureShareToken(rideId: string, role: SafetyRole): Promise<string | null> {
  if (role !== "passenger") return null;
  const safeRideId = requireUuid(rideId, "ride_id");
  const client = supabase as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await client.rpc("create_passenger_share_token", { _ride_id: safeRideId });
  if (error) {
    if (import.meta.env.DEV) console.warn("[APOIS TRACK] create token", error.message);
    throw new Error("share_token_create_failed");
  }

  const token = String((data as { share_token?: unknown } | null)?.share_token ?? "").trim();
  if (!UUID_RE.test(token)) throw new Error("share_token_invalid");
  return token;
}
