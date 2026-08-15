import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, Wallet, WalletCards } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import {
  DSBadge,
  DSButton,
  DSCard,
  DSCardContent,
  DSInput,
  EmptyState,
  Loading,
} from "@/design-system";
import { formatDate } from "@/lib/formatters";
import { toast } from "sonner";

type Driver = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
};

type WalletRow = {
  driver_id: string;
  balance: number;
  available_balance: number;
  updated_at: string;
};

type WithdrawalRow = {
  id: string;
  driver_id: string;
  amount: number;
  status: string;
  provider: string | null;
  provider_transfer_id: string | null;
  failure_reason: string | null;
  requested_at: string;
  processed_at: string | null;
};

export const Route = createFileRoute("/admin/financeiro-motoristas")({
  head: () => ({ meta: [{ title: "Financeiro motoristas — Admin APOIS" }] }),
  component: AdminDriverFinancePage,
});

const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));

function withdrawalVariant(status: string): "success" | "warning" | "danger" | "muted" {
  if (status === "paid") return "success";
  if (status === "pending" || status === "approved" || status === "processing") return "warning";
  if (status === "failed") return "danger";
  return "muted";
}

function withdrawalLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "Pendente",
    approved: "Aprovado (legado)",
    processing: "Processando",
    paid: "Pago",
    failed: "Falhou",
    reversed: "Revertido",
    cancelled: "Cancelado",
  };
  return labels[status] ?? status;
}

function AdminDriverFinancePage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [driverResult, walletResult, withdrawalResult] = await Promise.all([
        supabase
          .from("drivers")
          .select("id,name,email,phone,city")
          .order("name", { ascending: true }),
        supabase.from("driver_wallets").select("driver_id,balance,available_balance,updated_at"),
        supabase
          .from("driver_withdrawals")
          .select(
            "id,driver_id,amount,status,provider,provider_transfer_id,failure_reason,requested_at,processed_at",
          )
          .order("requested_at", { ascending: false })
          .limit(100),
      ]);
      if (driverResult.error) throw driverResult.error;
      if (walletResult.error) throw walletResult.error;
      if (withdrawalResult.error) throw withdrawalResult.error;
      setDrivers((driverResult.data ?? []) as Driver[]);
      setWallets((walletResult.data ?? []) as WalletRow[]);
      setWithdrawals((withdrawalResult.data ?? []) as WithdrawalRow[]);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o financeiro dos motoristas.",
      );
      setDrivers([]);
      setWallets([]);
      setWithdrawals([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const channel = supabase
      .channel("admin-driver-finance")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "driver_wallets" },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "driver_withdrawals" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const driverById = useMemo(
    () => new Map(drivers.map((driver) => [driver.id, driver])),
    [drivers],
  );
  const walletByDriver = useMemo(
    () => new Map(wallets.map((wallet) => [wallet.driver_id, wallet])),
    [wallets],
  );

  const filteredDrivers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return drivers;
    return drivers.filter((driver) =>
      [driver.name, driver.email, driver.phone, driver.city]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [drivers, query]);

  const totals = useMemo(
    () => ({
      balance: wallets.reduce((sum, row) => sum + Number(row.balance || 0), 0),
      available: wallets.reduce((sum, row) => sum + Number(row.available_balance || 0), 0),
      pending: withdrawals
        .filter((row) => ["pending", "approved", "processing"].includes(row.status))
        .reduce((sum, row) => sum + Number(row.amount || 0), 0),
    }),
    [wallets, withdrawals],
  );

  return (
    <AdminLayout
      title="Financeiro motoristas"
      description="Carteiras e acompanhamento de saques pelos ledgers canônicos"
      actions={
        <DSButton
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
          className="gap-1"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </DSButton>
      }
    >
      <DSCard className="mb-4 border-primary/20 bg-primary/5">
        <DSCardContent className="p-4 text-sm text-muted-foreground">
          Fonte de verdade: <strong>driver_wallets</strong>,{" "}
          <strong>driver_wallet_transactions</strong> e <strong>driver_withdrawals</strong>. Esta
          tela é de acompanhamento: o navegador não aprova, reprova nem confirma transferências.
          Mudanças financeiras de saque pertencem ao fluxo autenticado do backend e ao provedor
          homologado.
        </DSCardContent>
      </DSCard>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Metric label="Saldo contábil" value={money(totals.balance)} />
        <Metric label="Disponível para saque" value={money(totals.available)} />
        <Metric label="Saques em aberto" value={money(totals.pending)} />
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <DSInput
          className="pl-9"
          placeholder="Buscar motorista"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {loading ? (
        <Loading label="Carregando carteiras..." />
      ) : filteredDrivers.length === 0 ? (
        <EmptyState
          icon={WalletCards}
          title="Nenhum motorista encontrado"
          description="As carteiras serão exibidas quando existirem perfis de motorista."
        />
      ) : (
        <div className="space-y-2">
          {filteredDrivers.map((driver) => {
            const wallet = walletByDriver.get(driver.id);
            return (
              <DSCard key={driver.id}>
                <DSCardContent className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{driver.name || "Motorista sem nome"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {driver.email || driver.phone || driver.city || "Sem contato"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Saldo
                    </p>
                    <p className="font-semibold">{money(wallet?.balance ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Disponível
                    </p>
                    <p className="font-semibold text-primary">
                      {money(wallet?.available_balance ?? 0)}
                    </p>
                  </div>
                </DSCardContent>
              </DSCard>
            );
          })}
        </div>
      )}

      <section className="mt-6">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Wallet className="h-4 w-4 text-primary" /> Saques recentes
        </h2>
        {withdrawals.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Nenhum saque registrado"
            description="Solicitações de saque aparecerão aqui."
          />
        ) : (
          <div className="space-y-2">
            {withdrawals.map((row) => {
              const driver = driverById.get(row.driver_id);
              return (
                <DSCard key={row.id}>
                  <DSCardContent className="flex flex-wrap items-center gap-2 p-3 text-xs">
                    <strong>{driver?.name || row.driver_id.slice(0, 8)}</strong>
                    <DSBadge variant={withdrawalVariant(row.status)}>
                      {withdrawalLabel(row.status)}
                    </DSBadge>
                    <span>{money(row.amount)}</span>
                    <span className="text-muted-foreground">
                      {row.provider || "provedor ainda não atribuído"}
                    </span>
                    <span className="ml-auto text-muted-foreground">
                      {formatDate(row.processed_at ?? row.requested_at)}
                    </span>
                    {row.status === "pending" && (
                      <p className="w-full border-t pt-2 text-muted-foreground">
                        Solicitação registrada. O backend decidirá o próximo estado conforme a
                        homologação e o provedor configurado.
                      </p>
                    )}
                    {row.status === "approved" && (
                      <p className="w-full text-muted-foreground">
                        Estado legado de aprovação. Nenhuma ação manual é oferecida nesta tela.
                      </p>
                    )}
                    {row.status === "processing" && (
                      <p className="w-full text-muted-foreground">
                        Transferência em processamento pelo fluxo financeiro seguro.
                      </p>
                    )}
                    {row.provider_transfer_id && (
                      <p className="w-full text-muted-foreground">
                        Transferência: {row.provider_transfer_id}
                      </p>
                    )}
                    {row.failure_reason && (
                      <p className="w-full text-destructive">{row.failure_reason}</p>
                    )}
                  </DSCardContent>
                </DSCard>
              );
            })}
          </div>
        )}
      </section>
    </AdminLayout>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <DSCard>
      <DSCardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-bold">{value}</p>
      </DSCardContent>
    </DSCard>
  );
}
