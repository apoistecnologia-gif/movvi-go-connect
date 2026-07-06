import { supabase } from "@/integrations/supabase/client";

export type PassengerWallet = {
  id: string;
  passenger_id: string;
  balance: number;
  currency: string;
  is_blocked: boolean;
  blocked_reason: string | null;
  updated_at: string;
};

export type CancellationFee = {
  id: string;
  ride_id: string;
  passenger_id: string;
  driver_id: string | null;
  cancelled_by: string;
  ride_status_at_cancel: string;
  seconds_since_accept: number | null;
  fee_amount: number;
  driver_credit: number;
  is_paid: boolean;
  paid_at: string | null;
  created_at: string;
  ride?: {
    origin_name: string | null;
    destination_name: string | null;
    final_price: number | null;
    estimated_price: number | null;
  } | null;
};

export function feeReasonLabel(f: Pick<CancellationFee, "ride_status_at_cancel" | "seconds_since_accept">): string {
  if (f.ride_status_at_cancel === "motorista_chegou") return "Motorista já havia chegado ao ponto de embarque";
  if ((f.seconds_since_accept ?? 0) > 180) return "Cancelamento mais de 3 min após o motorista aceitar";
  return "Cancelamento após o motorista aceitar";
}

export async function getPassengerWallet(passengerId: string): Promise<PassengerWallet | null> {
  const { data } = await supabase
    .from("passenger_wallets")
    .select("*")
    .eq("passenger_id", passengerId)
    .maybeSingle();
  return (data as PassengerWallet | null) ?? null;
}

export async function listPassengerFees(passengerId: string): Promise<CancellationFee[]> {
  const { data } = await supabase
    .from("cancellation_fees")
    .select("*, ride:rides(origin_name,destination_name,final_price,estimated_price)")
    .eq("passenger_id", passengerId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data as unknown as CancellationFee[] | null) ?? [];
}


export async function listDriverWalletTx(driverId: string): Promise<DriverWalletTx[]> {
  const { data } = await supabase
    .from("driver_wallet_transactions")
    .select("*")
    .eq("driver_id", driverId)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data as DriverWalletTx[] | null) ?? [];
}

export function formatBRL(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);
}
