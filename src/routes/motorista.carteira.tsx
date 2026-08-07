import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowDownLeft,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loadDriverProfile } from "@/lib/driverProfile";

export const Route = createFileRoute("/motorista/carteira")({
  component: DriverWalletPage,
  head: () => ({ meta: [{ title: "Carteira — APOIS Motorista" }] }),
});

type WalletRow = {
  driver_id: string;
  balance: number | string;
  available_balance: number | string;
  updated_at: string;
};

type WalletTransaction = {
  id: string;
  driver_id: string;
  amount: number | string;
  direction: "credit" | "debit";
  source: string;
  source_id: string | null;
  description: string | null;
  created_at: string;
};

const money = (value: number | string | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value ?? 0));

const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

function sourceLabel(source: string) {
  if (source === "cancellation_fee") return "Multa de cancelamento";
  if (source === "ride") return "Corrida";
  if (source === "adjustment") return "Ajuste";
  return "Crédito da carteira";
}

function DriverWalletPage() {
  const navigate = useNavigate();
  const [driverId, setDriverId] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletRow | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: string, manual = false) => {
    if (manual) setRefreshing(true);
    setError(null);
    const db = supabase as any;
    try {
      const [walletResult, txResult] = await Promise.all([
        db.from("driver_wallets").select("driver_id,balance,available_balance,updated_at").eq("driver_id", id).maybeSingle(),
        db.from("driver_wallet_transactions").select("id,driver_id,amount,direction,source,source_id,description,created_at").eq("driver_id", id).order("created_at", { ascending: false }).limit(50),
      ]);
      if (walletResult.error) throw walletResult.error;
      if (txResult.error) throw txResult.error;
      setWallet((walletResult.data as WalletRow | null) ?? {
        driver_id: id,
        balance: 0,
        available_balance: 0,
        updated_at: new Date().toISOString(),
      });
      setTransactions((txResult.data as WalletTransaction[] | null) ?? []);
    } catch (caught) {
      console.error("[APOIS Motorista] carteira:", caught);
      setError("Não foi possível carregar a carteira agora.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const profile = await loadDriverProfile();
      if (!alive) return;
      if (!profile.ok) {
        await navigate({ to: profile.reason === "no_session" ? "/motorista/login" : "/motorista/status" });
        return;
      }
      setDriverId(profile.profile.id);
      await load(profile.profile.id);
    })();
    return () => { alive = false; };
  }, [load, navigate]);

  useEffect(() => {
    if (!driverId) return;
    const channel = supabase
      .channel(`apois-driver-wallet-${driverId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_wallets", filter: `driver_id=eq.${driverId}` }, () => void load(driverId))
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_wallet_transactions", filter: `driver_id=eq.${driverId}` }, () => void load(driverId))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [driverId, load]);

  const cancellationCredits = useMemo(
    () => transactions
      .filter((tx) => tx.direction === "credit" && tx.source === "cancellation_fee")
      .reduce((sum, tx) => sum + Number(tx.amount), 0),
    [transactions],
  );

  return (
    <div className="min-h-[100dvh] bg-[#050607] text-white">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#08090A]/95 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <button
            type="button"
            aria-label="Voltar para o mapa"
            onClick={() => void navigate({ to: "/motorista/app" })}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/8 bg-[#111315] text-white active:scale-95"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#F6BE1C]">Financeiro</p>
            <h1 className="mt-0.5 text-xl font-black tracking-tight">Minha carteira</h1>
          </div>
          <button
            type="button"
            aria-label="Atualizar carteira"
            disabled={!driverId || refreshing}
            onClick={() => driverId && void load(driverId, true)}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/8 bg-[#111315] text-[#F6BE1C] disabled:opacity-40"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-5 pb-[calc(env(safe-area-inset-bottom)+28px)]">
        {loading ? (
          <div className="flex min-h-[55vh] items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-[#F6BE1C]" />
          </div>
        ) : error ? (
          <section className="rounded-[24px] border border-red-500/20 bg-red-500/8 p-5 text-center">
            <p className="text-sm font-black text-red-300">{error}</p>
            <button
              type="button"
              onClick={() => driverId && void load(driverId, true)}
              className="mt-4 min-h-11 rounded-2xl bg-[#F6BE1C] px-5 text-xs font-black text-black"
            >
              Tentar novamente
            </button>
          </section>
        ) : (
          <>
            <section className="relative overflow-hidden rounded-[30px] border border-[#F6BE1C]/20 bg-gradient-to-br from-[#241C08] via-[#111315] to-[#08090A] p-6 shadow-[0_26px_70px_-36px_rgba(246,190,28,0.7)]">
              <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[#F6BE1C]/10 blur-3xl" />
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#F6BE1C]">Saldo disponível</p>
                  <p className="mt-3 text-[34px] font-black tracking-[-0.05em] text-white">{money(wallet?.available_balance)}</p>
                  <p className="mt-2 text-[11px] font-medium leading-5 text-zinc-500">Créditos confirmados e disponíveis para saque quando a integração financeira estiver ativa.</p>
                </div>
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#F6BE1C] text-black">
                  <WalletCards className="h-6 w-6" />
                </div>
              </div>
              <div className="relative mt-5 flex items-center justify-between border-t border-white/8 pt-4">
                <span className="flex items-center gap-2 text-[10px] font-black text-zinc-300">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" /> Carteira APOIS
                </span>
                <span className="text-[10px] font-bold text-zinc-600">Total: {money(wallet?.balance)}</span>
              </div>
            </section>

            <section className="grid grid-cols-2 gap-3">
              <div className="rounded-[22px] border border-white/5 bg-[#101214] p-4">
                <ArrowDownLeft className="h-5 w-5 text-[#F6BE1C]" />
                <p className="mt-3 text-[9px] font-black uppercase tracking-[0.14em] text-zinc-600">Multas recebidas</p>
                <p className="mt-1 text-lg font-black text-white">{money(cancellationCredits)}</p>
              </div>
              <div className="rounded-[22px] border border-white/5 bg-[#101214] p-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <p className="mt-3 text-[9px] font-black uppercase tracking-[0.14em] text-zinc-600">Situação</p>
                <p className="mt-1 text-sm font-black text-white">Regular</p>
              </div>
            </section>

            <section className="rounded-[24px] border border-[#F6BE1C]/15 bg-[#0D0F11] p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#F6BE1C]">Saques automáticos</p>
              <h2 className="mt-2 text-base font-black text-white">Estrutura preparada</h2>
              <p className="mt-2 text-[11px] font-medium leading-5 text-zinc-500">
                A carteira já registra os créditos reais. A solicitação e o envio automático de saques serão liberados somente quando a integração com a plataforma financeira for concluída. Nenhum saque fictício é exibido neste app.
              </p>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between px-1">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-600">Movimentações</p>
                  <h2 className="mt-1 text-base font-black text-white">Histórico da carteira</h2>
                </div>
                <Clock3 className="h-4 w-4 text-zinc-700" />
              </div>

              {transactions.length === 0 ? (
                <div className="rounded-[24px] border border-white/5 bg-[#0D0F11] p-6 text-center">
                  <WalletCards className="mx-auto h-8 w-8 text-zinc-700" />
                  <p className="mt-3 text-sm font-black text-zinc-300">Nenhuma movimentação ainda</p>
                  <p className="mt-1 text-[10px] font-medium text-zinc-600">Créditos confirmados aparecerão aqui automaticamente.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {transactions.map((tx) => (
                    <article key={tx.id} className="flex items-center gap-3 rounded-[20px] border border-white/5 bg-[#101214] px-4 py-3.5">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${tx.direction === "credit" ? "bg-emerald-400/10 text-emerald-400" : "bg-red-400/10 text-red-400"}`}>
                        <ArrowDownLeft className={`h-4 w-4 ${tx.direction === "debit" ? "rotate-180" : ""}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-black text-white">{sourceLabel(tx.source)}</p>
                        <p className="mt-0.5 truncate text-[9.5px] font-medium text-zinc-600">{tx.description || dateLabel(tx.created_at)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`text-[13px] font-black ${tx.direction === "credit" ? "text-emerald-400" : "text-red-400"}`}>
                          {tx.direction === "credit" ? "+" : "-"}{money(tx.amount)}
                        </p>
                        <p className="mt-0.5 text-[8.5px] font-bold text-zinc-700">{dateLabel(tx.created_at)}</p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
