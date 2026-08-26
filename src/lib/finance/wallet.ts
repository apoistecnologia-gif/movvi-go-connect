import { supabase } from "@/integrations/supabase/client";
import type { DriverWallet } from "./types";

/**
 * Read-only adapter from the canonical `driver_wallets` ledger surface to the
 * UI shape used by the consolidated driver app.
 */
export async function getDriverWallet(driverId: string): Promise<DriverWallet | null> {
  const { data, error } = await supabase
    .from("driver_wallets")
    .select("driver_id,balance,available_balance,created_at,updated_at")
    .eq("driver_id", driverId)
    .maybeSingle();

  if (error || !data) return null;

  const balance = Number(data.balance ?? 0);
  const available = Number(data.available_balance ?? 0);
  return {
    id: data.driver_id,
    driver_id: data.driver_id,
    wallet_balance: balance,
    pending_balance: Math.max(0, balance - available),
    available_balance: available,
    currency: "BRL",
    wallet_status: "active",
    last_transaction_at: data.updated_at,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}
