import { supabase } from "@/integrations/supabase/client";
import type { FinancialTransaction, FinancialTxnType } from "./types";

export interface ListTransactionsOptions {
  driverId?: string;
  passengerId?: string;
  types?: FinancialTxnType[];
  limit?: number;
}

/**
 * Read financial transactions for a driver or passenger. RLS scopes the result
 * to the caller. Write paths are intentionally NOT exposed on the client —
 * transaction creation will be owned by future payment providers via
 * server-side services with the service role.
 */
export async function listTransactions(
  opts: ListTransactionsOptions,
): Promise<FinancialTransaction[]> {
  let q = supabase
    .from("financial_transactions")
    .select(
      "id,driver_id,passenger_id,type,status,amount,currency,method,description,reference_id,metadata,created_at,updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);

  if (opts.driverId) q = q.eq("driver_id", opts.driverId);
  if (opts.passengerId) q = q.eq("passenger_id", opts.passengerId);
  if (opts.types && opts.types.length > 0) q = q.in("type", opts.types);

  const { data, error } = await q;
  if (error || !data) return [];
  return data as FinancialTransaction[];
}
