/**
 * APOIS — Live tracking link helpers.
 * Builds the public /t/{token} URL a passenger can share so anyone
 * (no login) can watch the ride in real time in a browser.
 */
import { supabase } from "@/integrations/supabase/client";

export function buildTrackingUrl(token: string): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/t/${token}`;
  }
  return `https://movvi-go-connect.lovable.app/t/${token}`;
}

/** Ensures the given ride has a share_token; returns the token. */
export async function ensureShareToken(rideId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("rides")
    .select("share_token")
    .eq("id", rideId)
    .maybeSingle();
  if (error) {
    if (import.meta.env.DEV) console.warn("[APOIS TRACK] read token", error.message);
    return null;
  }
  return (data as { share_token: string | null } | null)?.share_token ?? null;
}
