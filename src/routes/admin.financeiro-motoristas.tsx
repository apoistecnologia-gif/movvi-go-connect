import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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

function cleanText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text || fallback;
}

function safeMoneyValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function safeDateValue(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

const money = (value: unknown) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    safeMoneyValue(value),
  );

function normalizeWithdrawalStatus(status: unknown) {
  return cleanText(status, "unknown").toLowerCase();
}

function withdrawalVariant(status: string): "success" | "warning" | "danger" | "muted" {
  const normalized = normalizeWithdrawalStatus(status);
  if (normalized === "paid") return "success";
  if (["pending", "approved", "processing"].includes(normalized)) return "warning";
  if (["failed", "reversed", "cancelled"].includes(normalized)) return "danger";
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
  return labels[normalizeWithdrawalStatus(status)] ?? "Status não reconhecido";
}

function AdminDriverFinancePage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestRef = useRef(0);

  async function load() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
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
      if (requestId !== requestRef.current) return;
      if (driverResult.error) throw driverResult.error;
      if (walletResult.error) throw walletResult.error;
      if (withdrawalResult.error) throw withdrawalResult.error;

      const normalizedDrivers = ((driverResult.data ?? []) as Driver[])
        .filter((row) => Boolean(cleanText(row.id)))
        .map((row) => ({
          ...row,
          id: cleanText(row.id),
          name: cleanText(row.name) || null,
          email: cleanText(row.email) || null,
          phone: cleanText(row.phone) || null,
          city: cleanText(row.city) || null,
        }));
      const normalizedWallets = ((walletResult.data ?? []) as WalletRow[])
        .filter((row) => Boolean(cleanText(row.driver_id)))
        .map((row) => ({
          ...row,
          driver_id: cleanText(row.driver_id),
          balance: safeMoneyValue(row.balance),
          available_balance: safeMoneyValue(row.available_balance),
          updated_at: safeDateValue(row.updated_at)?.toISOString() ?? "",
        }));
      const normalizedWithdrawals = ((withdrawalResult.data ?? []) as WithdrawalRow[])
        .filter((row) => Boolean(cleanText(row.id)) && Boolean(cleanText(row.driver_id)))
        .map((row) => ({
          ...row,
          id: cleanText(row.id),
          driver_id: cleanText(row.driver_id),
          amount: safeMoneyValue(row.amount),
          status: normalizeWithdrawalStatus(row.status),
          provider: cleanText(row.provider) || null,
          provider_transfer_id: cleanText(row.provider_transfer_id) || null,
          failure_reason: cleanText(row.failure_reason) || null,
          requested_at: safeDateValue(row.requested_at)?.toISOString() ?? "",
          processed_at: safeDateValue(row.processed_at)?.toISOString() ?? null,
        }));
      setDrivers(normalizedDrivers);
      setWallets(normalizedWallets);
      setWithdrawals(normalizedWithdrawals);
    } catch (error) {
      if (requestId !== requestRef.current) return;
      setDrivers([]);
      setWallets([]);
      setWithdrawals([]);
      setLoadError("Não foi possível carregar o financeiro dos motoristas agora. Tente novamente.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha no financeiro dos motoristas", error);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    let refreshTimer: number | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void load(), 250);
    };
    const channel = supabase
      .channel("admin-driver-finance")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "driver_wallets" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "driver_withdrawals" },
        scheduleRefresh,
      )
      .subscribe();
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      requestRef.current += 1;
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
      document.removeEventListener("visibilitychange", onVisible);
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
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    if (!needle) return drivers;
    return drivers.filter((driver) =>
      [driver.name, driver.email, driver.phone, driver.city]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(needle)),
    );
  }, [drivers, query]);

  const totals = useMemo(
    () => ({
      balance: wallets.reduce((sum, row) => sum + safeMoneyValue(row.balance), 0),
      available: wallets.reduce((sum, row) => sum + safeMoneyValue(row.available_balance), 0),
      pending: withdrawals
        .filter((row) => ["pending", "approved", "processing"].includes(normalizeWithdrawalStatus(row.status)))
        .reduce((sum, row) => sum + safeMoneyValue(row.amount), 0),
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
          className="min-h-11 gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-busy={loading}
        >
          <RefreshCw
            className={`h-4 w-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`}
            aria-hidden="true"
          />
          {loading ? "Atualizando…" : "Atualizar"}
        </DSButton>
      }
    >
      <DSCard className="mb-4 border-primary/20 bg-primary/5">
        <DSCardContent className="p-4 text-sm leading-6 text-muted-foreground">
          Fonte de verdade: <strong>driver_wallets</strong>,{" "}
          <strong>driver_wallet_transactions</strong> e <strong>driver_withdrawals</strong>. Esta
          tela é de acompanhamento: o navegador não aprova, reprova nem confirma transferências.
          Mudanças financeiras de saque pertencem ao fluxo autenticado do backend, ao provedor
          homologado e ao gate financeiro. Um provedor informado não significa payout habilitado.
        </DSCardContent>
      </DSCard>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Metric label="Saldo contábil" value={money(totals.balance)} />
        <Metric label="Disponível para saque" value={money(totals.available)} />
        <Metric label="Saques em aberto" value={money(totals.pending)} />
      </div>

      <div className="relative mb-4">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <DSInput
          className="min-h-11 pl-9 text-base"
          placeholder="Buscar motorista"
          value={query}
          maxLength={120}
          aria-label="Buscar motorista por nome, contato ou cidade"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {loading ? (
        <div role="status" aria-live="polite">
          <Loading label="Carregando carteiras..." />
        </div>
      ) : loadError ? (
        <DSCard className="border-destructive/30 bg-destructive/5">
          <DSCardContent className="space-y-3 p-4" role="alert">
            <p className="text-sm font-medium text-destructive">{loadError}</p>
            <DSButton variant="outline" className="min-h-11" onClick={() => void load()}>
              Tentar novamente
            </DSButton>
          </DSCardContent>
        </DSCard>
      ) : filteredDrivers.length === 0 ? (
        <EmptyState
          icon={WalletCards}
          title={query.trim() ? "Nenhum motorista corresponde à busca" : "Nenhum motorista encontrado"}
          description={query.trim() ? "Revise o termo pesquisado." : "As carteiras serão exibidas quando existirem perfis de motorista."}
        />
      ) : (
        <div className="space-y-2">
          {filteredDrivers.map((driver) => {
            const wallet = walletByDriver.get(driver.id);
            return (
              <DSCard key={driver.id}>
                <DSCardContent className="grid min-w-0 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="break-words font-semibold">{driver.name || "Motorista sem nome"}</p>
                    <p className="break-all text-sm text-muted-foreground">
                      {driver.email || driver.phone || driver.city || "Sem contato"}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Saldo</p>
                    <p className="break-words font-semibold tabular-nums">{money(wallet?.balance ?? 0)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Disponível</p>
                    <p className="break-words font-semibold tabular-nums text-primary">
                      {money(wallet?.available_balance ?? 0)}
                    </p>
                  </div>
                </DSCardContent>
              </DSCard>
            );
          })}
        </div>
      )}

      <section className="mt-6" aria-labelledby="recent-withdrawals-title">
        <h2 id="recent-withdrawals-title" className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Wallet className="h-4 w-4 text-primary" aria-hidden="true" /> Saques recentes
        </h2>
        {!loading && withdrawals.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Nenhum saque registrado"
            description="Solicitações de saque aparecerão aqui."
          />
        ) : (
          <div className="space-y-2">
            {withdrawals.map((row) => {
              const driver = driverById.get(row.driver_id);
              const status = normalizeWithdrawalStatus(row.status);
              return (
                <DSCard key={row.id}>
                  <DSCardContent className="flex min-w-0 flex-wrap items-center gap-2 p-3 text-sm">
                    <strong className="min-w-0 break-words">{driver?.name || row.driver_id.slice(0, 8)}</strong>
                    <DSBadge variant={withdrawalVariant(status)}>{withdrawalLabel(status)}</DSBadge>
                    <span className="font-semibold tabular-nums">{money(row.amount)}</span>
                    <span className="break-words text-muted-foreground">
                      {row.provider || "Provedor ainda não atribuído"}
                    </span>
                    <span className="ml-auto break-words text-muted-foreground">
                      {row.processed_at || row.requested_at
                        ? formatDate(row.processed_at ?? row.requested_at)
                        : "Data não informada"}
                    </span>
                    {status === "pending" && (
                      <p className="w-full border-t pt-2 text-muted-foreground">
                        Solicitação registrada. O backend decidirá o próximo estado conforme a
                        homologação, o gate de saques e o provedor configurado.
                      </p>
                    )}
                    {status === "approved" && (
                      <p className="w-full text-muted-foreground">
                        Estado legado de aprovação. Nenhuma ação manual é oferecida nesta tela.
                      </p>
                    )}
                    {status === "processing" && (
                      <p className="w-full text-muted-foreground">
                        Transferência em processamento pelo fluxo financeiro seguro.
                      </p>
                    )}
                    {row.provider_transfer_id && (
                      <p className="w-full break-all text-muted-foreground">
                        Transferência: {row.provider_transfer_id}
                      </p>
                    )}
                    {row.failure_reason && status === "failed" && (
                      <p className="w-full text-destructive" role="alert">
                        O saque falhou. Consulte a auditoria financeira para o detalhe técnico.
                      </p>
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
      <DSCardContent className="min-w-0 p-4">
        <p className="break-words text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 break-words text-xl font-bold tabular-nums">{value}</p>
      </DSCardContent>
    </DSCard>
  );
}
