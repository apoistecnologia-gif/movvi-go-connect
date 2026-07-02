import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_FINANCE_SETTINGS,
  type FinanceSettings,
  type PaymentMethodKind,
} from "./types";

const KEYS = [
  "finance.monthly_fee",
  "finance.currency",
  "finance.default_payment_method",
  "finance.wallet_enabled",
  "finance.withdrawal_enabled",
  "finance.supported_methods",
  "finance.discount_rules",
] as const;

/** Read centralized financial settings. Never hardcode these values inside components. */
export async function loadFinanceSettings(): Promise<FinanceSettings> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("key,value")
    .in("key", KEYS as unknown as string[]);

  if (error || !data) return { ...DEFAULT_FINANCE_SETTINGS };

  const map = new Map(data.map((r) => [r.key, r.value as unknown]));
  const pick = <T,>(k: string, fallback: T): T => {
    const v = map.get(k);
    return (v === undefined || v === null ? fallback : (v as T));
  };

  return {
    monthly_fee: Number(pick("finance.monthly_fee", DEFAULT_FINANCE_SETTINGS.monthly_fee)),
    currency: String(pick("finance.currency", DEFAULT_FINANCE_SETTINGS.currency)),
    default_payment_method: pick<PaymentMethodKind>(
      "finance.default_payment_method",
      DEFAULT_FINANCE_SETTINGS.default_payment_method,
    ),
    wallet_enabled: Boolean(pick("finance.wallet_enabled", DEFAULT_FINANCE_SETTINGS.wallet_enabled)),
    withdrawal_enabled: Boolean(
      pick("finance.withdrawal_enabled", DEFAULT_FINANCE_SETTINGS.withdrawal_enabled),
    ),
    supported_methods: pick<PaymentMethodKind[]>(
      "finance.supported_methods",
      DEFAULT_FINANCE_SETTINGS.supported_methods,
    ),
    discount_rules: pick<Record<string, unknown>>(
      "finance.discount_rules",
      DEFAULT_FINANCE_SETTINGS.discount_rules,
    ),
  };
}

export function formatCurrency(value: number, currency = "BRL"): string {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value ?? 0);
  } catch {
    return `R$ ${(value ?? 0).toFixed(2)}`;
  }
}
