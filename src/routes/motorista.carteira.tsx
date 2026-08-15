import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  KeyRound,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loadDriverProfile } from "@/lib/driverProfile";
import { ApoisDriverBottomNav } from "@/components/ApoisDriverBottomNav";

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

type PayoutDestination = {
  driver_id: string;
  pix_key: string;
  pix_key_type: "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "EVP";
  holder_name: string | null;
  confirmed_at: string | null;
  payout_available_at: string | null;
};

type Withdrawal = {
  id: string;
  amount: number | string;
  status: "pending" | "processing" | "paid" | "failed" | "cancelled";
  provider: string | null;
  failure_reason: string | null;
  requested_at: string;
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
  if (source === "withdrawal") return "Saque Pix";
  if (source === "withdrawal_refund") return "Estorno de saque";
  return "Movimentação da carteira";
}

function withdrawalLabel(status: Withdrawal["status"]) {
  if (status === "paid") return "Pago";
  if (status === "processing") return "Processando";
  if (status === "failed") return "Falhou / estornado";
  if (status === "cancelled") return "Cancelado";
  return "Pendente";
}

function DriverWalletPage() {
  const navigate = useNavigate();
  const [driverId, setDriverId] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletRow | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [destination, setDestination] = useState<PayoutDestination | null>(null);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pixType, setPixType] = useState<PayoutDestination["pix_key_type"]>("CPF");
  const [pixKey, setPixKey] = useState("");
  const [holderName, setHolderName] = useState("");
  const [savingPix, setSavingPix] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [requestingPayout, setRequestingPayout] = useState(false);
  const [financeMessage, setFinanceMessage] = useState<string | null>(null);

  const load = useCallback(async (id: string, manual = false) => {
    if (manual) setRefreshing(true);
    setError(null);
    const db = supabase as any;
    try {
      const [walletResult, txResult, destinationResult, withdrawalsResult] = await Promise.all([
        db.from("driver_wallets").select("driver_id,balance,available_balance,updated_at").eq("driver_id", id).maybeSingle(),
        db.from("driver_wallet_transactions").select("id,driver_id,amount,direction,source,source_id,description,created_at").eq("driver_id", id).order("created_at", { ascending: false }).limit(50),
        db.from("driver_payout_destinations").select("driver_id,pix_key,pix_key_type,holder_name,confirmed_at,payout_available_at").eq("driver_id", id).maybeSingle(),
        db.from("driver_withdrawals").select("id,amount,status,provider,failure_reason,requested_at").eq("driver_id", id).order("requested_at", { ascending: false }).limit(20),
      ]);
      if (walletResult.error) throw walletResult.error;
      if (txResult.error) throw txResult.error;
      if (destinationResult.error) throw destinationResult.error;
      if (withdrawalsResult.error) throw withdrawalsResult.error;

      setWallet((walletResult.data as WalletRow | null) ?? {
        driver_id: id,
        balance: 0,
        available_balance: 0,
        updated_at: new Date().toISOString(),
      });
      setTransactions((txResult.data as WalletTransaction[] | null) ?? []);
      const loadedDestination = (destinationResult.data as PayoutDestination | null) ?? null;
      setDestination(loadedDestination);
      setWithdrawals((withdrawalsResult.data as Withdrawal[] | null) ?? []);
      if (loadedDestination) {
        setPixType(loadedDestination.pix_key_type);
        setPixKey(loadedDestination.pix_key);
        setHolderName(loadedDestination.holder_name ?? "");
      }
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
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_withdrawals", filter: `driver_id=eq.${driverId}` }, () => void load(driverId))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [driverId, load]);

  const cancellationCredits = useMemo(
    () => transactions
      .filter((tx) => tx.direction === "credit" && tx.source === "cancellation_fee")
      .reduce((sum, tx) => sum + Number(tx.amount), 0),
    [transactions],
  );

  const payoutReadyAt = destination?.payout_available_at ? new Date(destination.payout_available_at) : null;
  const payoutInCooldown = Boolean(payoutReadyAt && payoutReadyAt.getTime() > Date.now());
  const destinationReady = Boolean(destination?.confirmed_at && !payoutInCooldown);

  const savePixDestination = async () => {
    if (!driverId || !pixKey.trim()) return;
    setSavingPix(true);
    setFinanceMessage(null);
    try {
      const { error: rpcError } = await (supabase as any).rpc("driver_set_payout_destination", {
        _pix_key: pixKey.trim(),
        _pix_key_type: pixType,
        _holder_name: holderName.trim() || null,
      });
      if (rpcError) throw rpcError;
      await load(driverId);
      setFinanceMessage("Chave Pix salva com segurança. Alterações entram em proteção por 24 horas antes de liberar saques.");
    } catch (caught: any) {
      console.error("[APOIS Motorista] chave Pix:", caught);
      const detail = String(caught?.message ?? caught ?? "");
      setFinanceMessage(detail.includes("invalid_pix") ? "Confira o formato da chave Pix informada." : "Não foi possível salvar a chave Pix agora.");
    } finally {
      setSavingPix(false);
    }
  };

  const requestPayout = async () => {
    if (!driverId || !destinationReady) return;
    const amount = Number(payoutAmount.replace(",", "."));
    const amountCents = Math.round(amount * 100);
    if (!Number.isFinite(amount) || amountCents < 2000) {
      setFinanceMessage("O valor mínimo de saque é R$ 20,00.");
      return;
    }
    if (amount > Number(wallet?.available_balance ?? 0)) {
      setFinanceMessage("O valor solicitado é maior que o saldo disponível.");
      return;
    }

    setRequestingPayout(true);
    setFinanceMessage(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("request-driver-payout", {
        body: { amountCents, idempotencyKey: crypto.randomUUID() },
      });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(String(data.error));
      await load(driverId);
      setPayoutAmount("");
      setFinanceMessage(data?.status === "paid" ? "Saque Pix concluído." : "Saque recebido e enviado para processamento.");
    } catch (caught: any) {
      console.error("[APOIS Motorista] saque:", caught);
      const detail = String(caught?.message ?? caught ?? "");
      setFinanceMessage(
        detail.includes("not_homologated") || detail.includes("non-2xx")
          ? "Os saques Pix estão temporariamente indisponíveis enquanto a integração financeira conclui a homologação. Seu saldo permanece intacto."
          : "Não foi possível solicitar o saque agora. Seu saldo só é debitado quando o pedido é aceito pelo backend.",
      );
    } finally {
      setRequestingPayout(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#050607] text-white">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#08090A]/95 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <button type="button" aria-label="Voltar para o mapa" onClick={() => void navigate({ to: "/motorista/app" })} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/8 bg-[#111315] text-white active:scale-95">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#F6BE1C]">Financeiro</p>
            <h1 className="mt-0.5 text-xl font-black tracking-tight">Minha carteira</h1>
          </div>
          <button type="button" aria-label="Atualizar carteira" disabled={!driverId || refreshing} onClick={() => driverId && void load(driverId, true)} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/8 bg-[#111315] text-[#F6BE1C] disabled:opacity-40">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-5 pb-[calc(env(safe-area-inset-bottom)+112px)]">
        {loading ? (
          <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#F6BE1C]" /></div>
        ) : error ? (
          <section className="rounded-[24px] border border-red-500/20 bg-red-500/8 p-5 text-center">
            <p className="text-sm font-black text-red-300">{error}</p>
            <button type="button" onClick={() => driverId && void load(driverId, true)} className="mt-4 min-h-11 rounded-2xl bg-[#F6BE1C] px-5 text-xs font-black text-black">Tentar novamente</button>
          </section>
        ) : (
          <>
            <section className="relative overflow-hidden rounded-[30px] border border-[#F6BE1C]/20 bg-gradient-to-br from-[#241C08] via-[#111315] to-[#08090A] p-6 shadow-[0_26px_70px_-36px_rgba(246,190,28,0.7)]">
              <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[#F6BE1C]/10 blur-3xl" />
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#F6BE1C]">Saldo disponível</p>
                  <p className="mt-3 text-[34px] font-black tracking-[-0.05em] text-white">{money(wallet?.available_balance)}</p>
                  <p className="mt-2 text-[11px] font-medium leading-5 text-zinc-500">Saldo financeiro confirmado no ledger da APOIS.</p>
                </div>
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#F6BE1C] text-black"><WalletCards className="h-6 w-6" /></div>
              </div>
              <div className="relative mt-5 flex items-center justify-between border-t border-white/8 pt-4">
                <span className="flex items-center gap-2 text-[10px] font-black text-zinc-300"><ShieldCheck className="h-4 w-4 text-emerald-400" /> Carteira APOIS</span>
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
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#F6BE1C]/10 text-[#F6BE1C]"><KeyRound className="h-5 w-5" /></div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#F6BE1C]">Destino do saque</p>
                  <h2 className="mt-1 text-base font-black text-white">Chave Pix do motorista</h2>
                  <p className="mt-1 text-[10px] font-medium leading-4 text-zinc-500">A chave só pode ser alterada pelo seu login autenticado. Após uma alteração, há proteção de 24 horas antes de novos saques.</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-[120px_1fr] gap-2">
                <select value={pixType} onChange={(event) => setPixType(event.target.value as PayoutDestination["pix_key_type"])} className="min-h-12 rounded-2xl border border-white/8 bg-[#151719] px-3 text-xs font-black text-white outline-none focus:border-[#F6BE1C]/60">
                  <option value="CPF">CPF</option><option value="CNPJ">CNPJ</option><option value="EMAIL">E-mail</option><option value="PHONE">Telefone</option><option value="EVP">Aleatória</option>
                </select>
                <input value={pixKey} onChange={(event) => setPixKey(event.target.value)} placeholder="Digite sua chave Pix" autoCapitalize="none" className="min-h-12 min-w-0 rounded-2xl border border-white/8 bg-[#151719] px-4 text-xs font-bold text-white outline-none placeholder:text-zinc-700 focus:border-[#F6BE1C]/60" />
              </div>
              <input value={holderName} onChange={(event) => setHolderName(event.target.value)} placeholder="Nome do titular (opcional)" className="mt-2 min-h-12 w-full rounded-2xl border border-white/8 bg-[#151719] px-4 text-xs font-bold text-white outline-none placeholder:text-zinc-700 focus:border-[#F6BE1C]/60" />
              <button type="button" disabled={savingPix || !pixKey.trim()} onClick={() => void savePixDestination()} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#F6BE1C] text-xs font-black text-black disabled:opacity-40">
                {savingPix ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Salvar e confirmar chave
              </button>

              {destination && (
                <div className="mt-3 rounded-2xl border border-white/5 bg-black/20 px-4 py-3 text-[10px] font-bold leading-4 text-zinc-400">
                  {payoutInCooldown && payoutReadyAt
                    ? `Proteção ativa até ${dateLabel(payoutReadyAt.toISOString())}.`
                    : "Destino confirmado para solicitação de saque, sujeito à disponibilidade do provedor."}
                </div>
              )}
            </section>

            <section className="rounded-[24px] border border-white/5 bg-[#0D0F11] p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#F6BE1C]">Saque Pix</p>
              <h2 className="mt-2 text-base font-black text-white">Solicitar saque</h2>
              <div className="mt-4 flex gap-2">
                <input inputMode="decimal" value={payoutAmount} onChange={(event) => setPayoutAmount(event.target.value)} placeholder="Valor, ex.: 50,00" className="min-h-12 min-w-0 flex-1 rounded-2xl border border-white/8 bg-[#151719] px-4 text-sm font-black text-white outline-none placeholder:text-zinc-700 focus:border-[#F6BE1C]/60" />
                <button type="button" disabled={requestingPayout || !destinationReady || !payoutAmount.trim()} onClick={() => void requestPayout()} className="flex min-h-12 min-w-28 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-xs font-black text-black disabled:opacity-30">
                  {requestingPayout ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Sacar
                </button>
              </div>
              <p className="mt-2 text-[9.5px] font-medium leading-4 text-zinc-600">Mínimo R$ 20,00. A solicitação é idempotente e o saldo é estornado automaticamente se o provedor rejeitar a transferência.</p>
              {financeMessage && <p className="mt-3 rounded-2xl border border-[#F6BE1C]/15 bg-[#F6BE1C]/5 px-4 py-3 text-[10px] font-bold leading-4 text-zinc-300">{financeMessage}</p>}
            </section>

            {withdrawals.length > 0 && (
              <section>
                <div className="mb-3 px-1"><p className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-600">Saques</p><h2 className="mt-1 text-base font-black text-white">Últimas solicitações</h2></div>
                <div className="space-y-2">
                  {withdrawals.map((withdrawal) => (
                    <article key={withdrawal.id} className="flex items-center gap-3 rounded-[20px] border border-white/5 bg-[#101214] px-4 py-3.5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#F6BE1C]/10 text-[#F6BE1C]"><Send className="h-4 w-4" /></div>
                      <div className="min-w-0 flex-1"><p className="text-[12px] font-black text-white">{withdrawalLabel(withdrawal.status)}</p><p className="mt-0.5 text-[9px] font-medium text-zinc-600">{dateLabel(withdrawal.requested_at)} · {withdrawal.provider || "provedor"}</p></div>
                      <p className="text-[13px] font-black text-white">{money(withdrawal.amount)}</p>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <section>
              <div className="mb-3 flex items-center justify-between px-1">
                <div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-600">Movimentações</p><h2 className="mt-1 text-base font-black text-white">Histórico da carteira</h2></div>
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
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${tx.direction === "credit" ? "bg-emerald-400/10 text-emerald-400" : "bg-red-400/10 text-red-400"}`}><ArrowDownLeft className={`h-4 w-4 ${tx.direction === "debit" ? "rotate-180" : ""}`} /></div>
                      <div className="min-w-0 flex-1"><p className="truncate text-[12px] font-black text-white">{sourceLabel(tx.source)}</p><p className="mt-0.5 truncate text-[9.5px] font-medium text-zinc-600">{tx.description || dateLabel(tx.created_at)}</p></div>
                      <div className="shrink-0 text-right"><p className={`text-[13px] font-black ${tx.direction === "credit" ? "text-emerald-400" : "text-red-400"}`}>{tx.direction === "credit" ? "+" : "-"}{money(tx.amount)}</p><p className="mt-0.5 text-[8.5px] font-bold text-zinc-700">{dateLabel(tx.created_at)}</p></div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
      <ApoisDriverBottomNav />
    </div>
  );
}
