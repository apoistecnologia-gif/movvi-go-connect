import { supabase } from "@/integrations/supabase/client";
import type { DriverWallet } from "./types";

/**
 * Read the wallet for a driver. Returns null when no wallet row exists yet.
 * No money is moved here — read-only helper for the driver UI.
 */
export async function getDriverWallet(driverId: string): Promise<DriverWallet | null> {
  const { data, error } = await supabase
    .from("driver_wallets")
    .select(
      "id,driver_id,wallet_balance,pending_balance,available_balance,currency,wallet_status,last_transaction_at,created_at,updated_at",
    )
    .eq("driver_id", driverId)
    .maybeSingle();

  if (error) return null;
  return (data as DriverWallet) ?? null;
}
