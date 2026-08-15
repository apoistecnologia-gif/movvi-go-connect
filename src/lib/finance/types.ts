// Financial domain types (Phase 3 - infrastructure only, no payments).
// These MUST stay decoupled from ride lifecycle logic.

export type FinancialTxnType =
  | "subscription"
  | "ride_payment"
  | "refund"
  | "bonus"
  | "adjustment"
  | "withdrawal"
  | "promotion"
  | "future_pix"
  | "future_card";

export type FinancialTxnStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "refunded";

export type PaymentMethodKind =
  | "pix"
  | "credit_card"
  | "debit_card"
  | "cash"
  | "wallet"
  | "corporate";

export type WalletStatus = "active" | "frozen" | "closed";

export type DriverSubscriptionStatus =
  | "inactive"
  | "pending"
  | "active"
  | "overdue"
  | "expired"
  | "suspended"
  | "blocked"
  | "cancelled";

export interface DriverWallet {
  id: string;
  driver_id: string;
  wallet_balance: number;
  pending_balance: number;
  available_balance: number;
  currency: string;
  wallet_status: WalletStatus;
  last_transaction_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancialTransaction {
  id: string;
  driver_id: string | null;
  passenger_id: string | null;
  type: FinancialTxnType;
  status: FinancialTxnStatus;
  amount: number;
  currency: string;
  method: PaymentMethodKind | null;
  description: string | null;
  reference_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface FinanceSettings {
  monthly_fee: number;
  currency: string;
  default_payment_method: PaymentMethodKind;
  wallet_enabled: boolean;
  withdrawal_enabled: boolean;
  supported_methods: PaymentMethodKind[];
  discount_rules: Record<string, unknown>;
}

export const DEFAULT_FINANCE_SETTINGS: FinanceSettings = {
  monthly_fee: 49.9,
  currency: "BRL",
  default_payment_method: "pix",
  wallet_enabled: true,
  withdrawal_enabled: false,
  supported_methods: ["pix", "credit_card", "debit_card", "cash", "wallet"],
  discount_rules: {},
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodKind, string> = {
  pix: "PIX",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  cash: "Dinheiro",
  wallet: "Carteira APOIS",
  corporate: "Corporativo",
};

export const TXN_TYPE_LABELS: Record<FinancialTxnType, string> = {
  subscription: "Assinatura",
  ride_payment: "Pagamento de corrida",
  refund: "Reembolso",
  bonus: "Bônus",
  adjustment: "Ajuste",
  withdrawal: "Saque",
  promotion: "Promoção",
  future_pix: "PIX (futuro)",
  future_card: "Cartão (futuro)",
};

export const TXN_STATUS_LABELS: Record<FinancialTxnStatus, string> = {
  pending: "Pendente",
  processing: "Processando",
  completed: "Concluído",
  failed: "Falhou",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};

export const SUBSCRIPTION_STATUS_LABELS: Record<DriverSubscriptionStatus, string> = {
  inactive: "Inativa",
  pending: "Pendente",
  active: "Ativa",
  overdue: "Em atraso",
  expired: "Expirada",
  suspended: "Suspensa",
  blocked: "Bloqueada",
  cancelled: "Cancelada",
};
