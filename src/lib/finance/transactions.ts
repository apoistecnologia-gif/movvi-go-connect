import { supabase } from "@/integrations/supabase/client";
import type { FinancialTransaction, FinancialTxnType } from "./types";

export interface ListTransactionsOptions {
  driverId?: string;
  passengerId?: string;
  types?: FinancialTxnType[];
  limit?: number;
}

function classifySource(source: string, direction: string): FinancialTxnType {
  const normalized = source.toLowerCase();
  if (normalized.includes("ride")) return "ride_payment";
  if (normalized.includes("withdraw")) return "withdrawal";
  if (normalized.includes("refund")) return "refund";
  if (normalized.includes("bonus")) return "bonus";
  if (normalized.includes("subscription")) return "subscription";
  if (direction.toLowerCase() === "debit") return "adjustment";
  return "adjustment";
}

/**
 * Driver financial history comes from the canonical immutable wallet ledger.
 * Passenger financial history is not stored in this driver-only table and is
 * intentionally not fabricated by this adapter.
 */
export async function listTransactions(
  opts: ListTransactionsOptions,
): Promise<FinancialTransaction[]> {
  if (opts.passengerId && !opts.driverId) return [];

  let query = supabase
    .from("driver_wallet_transactions")
    .select("id,driver_id,amount,direction,source,source_id,description,created_at")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);

  if (opts.driverId) query = query.eq("driver_id", opts.driverId);

  const { data, error } = await query;
  if (error || !data) return [];

  return data
    .map((row): FinancialTransaction => ({
      id: row.id,
      driver_id: row.driver_id,
      passenger_id: null,
      type: classifySource(row.source, row.direction),
      status: "completed",
      amount: Number(row.amount),
      currency: "BRL",
      method: null,
      description: row.description,
      reference_id: row.source_id,
      metadata: { source: row.source, direction: row.direction },
      created_at: row.created_at,
      updated_at: row.created_at,
    }))
    .filter((row) => !opts.types?.length || opts.types.includes(row.type));
}
