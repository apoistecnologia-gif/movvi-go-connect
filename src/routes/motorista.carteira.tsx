import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Wallet as WalletIcon, ArrowLeft, Clock, CheckCircle2, Crown, AlertTriangle,
  ExternalLink, KeyRound, Send, Loader2, XCircle, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listDriverWalletTx, formatBRL, type DriverWalletTx,
} from "@/lib/wallet/wallet";
import { DSButton, DSInput, DSLabel } from "@/design-system";

type DriverFinancial = {
  financial_status: "inactive" | "pending" | "active" | "overdue" | "cancelled";
  subscription_value: number | null;
  next_due_date: string | null;
  last_invoice_url: string | null;
  asaas_subscription_id: string | null;
};

type PixKeyType = "cpf" | "cnpj" | "email" | "phone" | "random";
type DriverPix = {
  pix_key: string | null;
  pix_key_type: PixKeyType | null;
  pix_holder_name: string | null;
  name: string | null;
};
type Withdrawal = {
  id: string;
  amount: number;
  status: "pending" | "processing" | "paid" | "failed" | "cancelled";
  pix_key: string;
  pix_key_type: PixKeyType;
  failure_reason: string | null;
  created_at: string;
  paid_at: string | null;
};

const PIX_TYPE_LABEL: Record<PixKeyType, string> = {
  cpf: "CPF", cnpj: "CNPJ", email: "E-mail", phone: "Telefone", random: "Aleatória",
};

export const Route = createFileRoute("/motorista/carteira")({
  component: DriverWalletPage,
  head: () => ({
    meta: [{ title: "Carteira — APOIS" }, { name: "description", content: "Seus créditos APOIS." }],
  }),
});

function DriverWalletPage() {
  const navigate = useNavigate();
  const [tx, setTx] = useState<DriverWalletTx[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [fin, setFin] = useState<DriverFinancial | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [pix, setPix] = useState<DriverPix>({ pix_key: null, pix_key_type: null, pix_holder_name: null, name: null });
  const [editingPix, setEditingPix] = useState(false);
  const [pixDraft, setPixDraft] = useState<{ key: string; type: PixKeyType; holder: string }>({
    key: "", type: "cpf", holder: "",
  });
  const [savingPix, setSavingPix] = useState(false);

  const [showWithdraw, setShowWithdraw] = useState(false);
  const [wAmount, setWAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    let ch1: ReturnType<typeof supabase.channel> | null = null;
    let ch2: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate({ to: "/motorista/login" }); return; }
      setUserId(user.id);

      const [txRows, drvRes, wRes] = await Promise.all([
        listDriverWalletTx(user.id),
        supabase.from("drivers")
          .select("financial_status, subscription_value, next_due_date, last_invoice_url, asaas_subscription_id, pix_key, pix_key_type, pix_holder_name, name")
          .eq("user_id", user.id).maybeSingle(),
        supabase.from("driver_withdrawals")
          .select("id,amount,status,pix_key,pix_key_type,failure_reason,created_at,paid_at")
          .eq("driver_id", user.id)
          .order("created_at", { ascending: false }).limit(30),
      ]);
      if (!alive) return;
      const drv = drvRes.data as (DriverFinancial & DriverPix) | null;
      setFin(drv ? {
        financial_status: drv.financial_status, subscription_value: drv.subscription_value,
        next_due_date: drv.next_due_date, last_invoice_url: drv.last_invoice_url,
        asaas_subscription_id: drv.asaas_subscription_id,
      } : null);
      setPix({
        pix_key: drv?.pix_key ?? null, pix_key_type: drv?.pix_key_type ?? null,
        pix_holder_name: drv?.pix_holder_name ?? null, name: drv?.name ?? null,
      });
      setPixDraft({
        key: drv?.pix_key ?? "", type: (drv?.pix_key_type as PixKeyType) ?? "cpf",
        holder: drv?.pix_holder_name ?? drv?.name ?? "",
      });
      setTx(txRows);
      setWithdrawals((wRes.data as Withdrawal[] | null) ?? []);
      setLoading(false);

      ch1 = supabase.channel(`driver-wallet-${user.id}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "driver_wallet_transactions", filter: `driver_id=eq.${user.id}` },
          (p) => {
            const t = p.new as DriverWalletTx;
            setTx((prev) => [t, ...prev]);
            if (t.source === "cancellation_fee") {
              toast.success(`Novo crédito: ${formatBRL(Number(t.amount))}`);
            }
          },
        ).subscribe();

      ch2 = supabase.channel(`driver-withdrawals-${user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "driver_withdrawals", filter: `driver_id=eq.${user.id}` },
          (p) => {
            const row = p.new as Withdrawal;
            setWithdrawals((prev) => {
              const others = prev.filter((x) => x.id !== row.id);
              return [row, ...others].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
            });
            if (p.eventType === "UPDATE") {
              if (row.status === "paid") toast.success(`Saque de ${formatBRL(Number(row.amount))} concluído!`);
              if (row.status === "failed") toast.error(`Saque falhou: ${row.failure_reason ?? "erro"}`);
            }
          },
        ).subscribe();
    })();
    return () => { alive = false; if (ch1) supabase.removeChannel(ch1); if (ch2) supabase.removeChannel(ch2); };
  }, [navigate]);

  const { pending, available } = useMemo(() => {
    let p = 0, a = 0;
    for (const t of tx) {
      if (t.status === "pending") p += Number(t.amount);
      if (t.status === "available") a += Number(t.amount);
    }
    return { pending: p, available: a };
  }, [tx]);

  const hasPix = !!(pix.pix_key && pix.pix_key_type);

  async function savePix() {
    if (!userId) return;
    const key = pixDraft.key.trim();
    if (!key) { toast.error("Informe a chave Pix."); return; }
    if (!pixDraft.holder.trim()) { toast.error("Informe o nome do titular."); return; }
    setSavingPix(true);
    const { error } = await supabase.from("drivers")
      .update({ pix_key: key, pix_key_type: pixDraft.type, pix_holder_name: pixDraft.holder.trim() })
      .eq("user_id", userId);
    setSavingPix(false);
    if (error) { toast.error("Falha ao salvar: " + error.message); return; }
    setPix({ pix_key: key, pix_key_type: pixDraft.type, pix_holder_name: pixDraft.holder.trim(), name: pix.name });
    setEditingPix(false);
    toast.success("Chave Pix salva.");
  }

  async function requestWithdraw() {
    const amt = Number(wAmount.replace(",", "."));
    if (!amt || amt < 20) { toast.error("Valor mínimo R$ 20,00"); return; }
    if (amt > available) { toast.error("Saldo insuficiente."); return; }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("request-driver-payout", { body: { amount: amt } });
      if (error) throw new Error(error.message);
      const res = data as { ok?: boolean; error?: string; detail?: string };
      if (res?.ok) toast.success("Pix enviado!");
      else toast.warning(res?.detail ?? res?.error ?? "Saque em análise. Aguarde o processamento.");
      setShowWithdraw(false); setWAmount("");
      // Refresh saldo (transações mudam via realtime)
      if (userId) {
        const rows = await listDriverWalletTx(userId);
        setTx(rows);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao solicitar saque.");
    } finally { setSubmitting(false); }
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <button onClick={() => navigate({ to: "/motorista/app" })} className="rounded-full p-2 hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold">Minha Carteira</h1>
      </header>

      <main className="mx-auto max-w-md space-y-4 p-4">
        {fin && fin.asaas_subscription_id && (
          <section className={"rounded-2xl border p-4 " + (fin.financial_status === "active" ? "border-primary/30 bg-primary/5" : fin.financial_status === "overdue" ? "border-destructive/40 bg-destructive/10" : "border-border bg-card")}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {fin.financial_status === "overdue" ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <Crown className="h-4 w-4 text-primary" />}
                <div className="text-sm font-semibold">Mensalidade APOIS</div>
              </div>
              <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                {fin.financial_status === "active" ? "Ativa" : fin.financial_status === "pending" ? "Pendente" : fin.financial_status === "overdue" ? "Inadimplente" : fin.financial_status === "cancelled" ? "Cancelada" : "Inativa"}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <div className="text-2xl font-bold">{formatBRL(Number(fin.subscription_value ?? 49.9))}</div>
              <div className="text-xs text-muted-foreground">/ mês</div>
            </div>
            {fin.next_due_date && (
              <div className="mt-1 text-xs text-muted-foreground">
                Próximo vencimento: {new Date(fin.next_due_date + "T00:00:00").toLocaleDateString("pt-BR")}
              </div>
            )}
            {(fin.financial_status === "pending" || fin.financial_status === "overdue") && (
              <a href={fin.last_invoice_url ?? "#"} target="_blank" rel="noopener noreferrer"
                className={"mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold " + (fin.last_invoice_url ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground pointer-events-none")}>
                Pagar mensalidade <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </section>
        )}

        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" /> Disponível
            </div>
            <div className="mt-1 text-xl font-bold text-primary">{formatBRL(available)}</div>
            <div className="mt-1 text-[10px] text-muted-foreground">Sacável via Pix</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> Pendente
            </div>
            <div className="mt-1 text-xl font-bold text-foreground">{formatBRL(pending)}</div>
            <div className="mt-1 text-[10px] text-muted-foreground">Aguardando pagamento</div>
          </div>
        </section>

        {/* Sacar */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-primary" />
              <div className="text-sm font-semibold">Sacar via Pix</div>
            </div>
            <span className="text-[10px] text-muted-foreground">Mínimo R$ 20</span>
          </div>
          <DSButton className="mt-3 w-full" disabled={!hasPix || available < 20} onClick={() => { setWAmount(String(available.toFixed(2))); setShowWithdraw(true); }}>
            {available < 20 ? "Saldo insuficiente" : !hasPix ? "Cadastre sua chave Pix" : `Sacar ${formatBRL(available)}`}
          </DSButton>
          {!hasPix && (
            <div className="mt-2 text-[11px] text-amber-500">Você precisa cadastrar uma chave Pix abaixo antes de sacar.</div>
          )}
        </section>

        {/* Chave Pix */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              <div className="text-sm font-semibold">Minha chave Pix</div>
            </div>
            {hasPix && !editingPix && (
              <button className="text-xs font-medium text-primary hover:underline" onClick={() => setEditingPix(true)}>Alterar</button>
            )}
          </div>

          {!editingPix ? (
            hasPix ? (
              <div className="mt-3 space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] uppercase">{PIX_TYPE_LABEL[pix.pix_key_type!]}</span>
                  <span className="font-mono">{pix.pix_key}</span>
                </div>
                {pix.pix_holder_name && <div className="text-xs text-muted-foreground">Titular: {pix.pix_holder_name}</div>}
              </div>
            ) : (
              <DSButton variant="secondary" className="mt-3 w-full" onClick={() => setEditingPix(true)}>Cadastrar chave Pix</DSButton>
            )
          ) : (
            <div className="mt-3 space-y-3">
              <div>
                <DSLabel className="text-xs">Tipo de chave</DSLabel>
                <div className="mt-1 grid grid-cols-5 gap-1">
                  {(Object.keys(PIX_TYPE_LABEL) as PixKeyType[]).map((t) => (
                    <button key={t} type="button" onClick={() => setPixDraft((d) => ({ ...d, type: t }))}
                      className={"rounded-lg border px-2 py-1.5 text-[11px] font-medium " + (pixDraft.type === t ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground")}>
                      {PIX_TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <DSLabel className="text-xs">Chave Pix</DSLabel>
                <DSInput className="mt-1" value={pixDraft.key} onChange={(e) => setPixDraft((d) => ({ ...d, key: e.target.value }))}
                  placeholder={pixDraft.type === "cpf" ? "000.000.000-00" : pixDraft.type === "email" ? "voce@exemplo.com" : pixDraft.type === "phone" ? "+55 11 99999-9999" : pixDraft.type === "random" ? "chave aleatória" : "chave"} />
              </div>
              <div>
                <DSLabel className="text-xs">Nome do titular</DSLabel>
                <DSInput className="mt-1" value={pixDraft.holder} onChange={(e) => setPixDraft((d) => ({ ...d, holder: e.target.value }))} placeholder="Nome como aparece no banco" />
              </div>
              <div className="flex gap-2">
                <DSButton variant="secondary" className="flex-1" onClick={() => setEditingPix(false)}>Cancelar</DSButton>
                <DSButton className="flex-1" onClick={savePix} disabled={savingPix}>
                  {savingPix && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
                </DSButton>
              </div>
            </div>
          )}
        </section>

        {/* Histórico saques */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Send className="h-4 w-4" /> Meus saques
          </h2>
          {withdrawals.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">Nenhum saque ainda.</div>
          ) : (
            <ul className="divide-y divide-border">
              {withdrawals.map((w) => (
                <li key={w.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="text-sm font-medium">{formatBRL(Number(w.amount))}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(w.created_at).toLocaleString("pt-BR")} · {PIX_TYPE_LABEL[w.pix_key_type]}
                    </div>
                    {w.status === "failed" && w.failure_reason && (
                      <div className="text-[11px] text-destructive">{w.failure_reason.slice(0, 80)}</div>
                    )}
                  </div>
                  <StatusBadge status={w.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Histórico créditos */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <WalletIcon className="h-4 w-4" /> Movimentações
          </h2>
          {loading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Carregando…</div>
          ) : tx.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Nenhuma movimentação.</div>
          ) : (
            <ul className="divide-y divide-border">
              {tx.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="text-sm font-medium">{t.description ?? "Crédito"}</div>
                    <div className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString("pt-BR")}</div>
                  </div>
                  <div className="text-right">
                    <div className={"text-sm font-semibold " + (Number(t.amount) >= 0 ? "text-primary" : "text-foreground")}>
                      {Number(t.amount) >= 0 ? "+" : ""}{formatBRL(Number(t.amount))}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t.status === "pending" ? "Pendente" : t.status === "available" ? "Disponível" : t.status === "withdrawn" ? "Sacado" : t.status}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {/* Sheet de saque */}
      {showWithdraw && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={() => !submitting && setShowWithdraw(false)}>
          <div className="w-full max-w-md rounded-t-2xl border border-border bg-background p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">Sacar via Pix</h3>
              <button onClick={() => setShowWithdraw(false)} disabled={submitting} className="text-muted-foreground hover:text-foreground"><XCircle className="h-5 w-5" /></button>
            </div>
            <div className="mb-3 rounded-lg border border-border bg-muted/40 p-3 text-xs">
              <div className="text-muted-foreground">Chave destino</div>
              <div className="mt-0.5 font-medium">
                <span className="mr-1.5 rounded bg-background px-1.5 py-0.5 text-[10px] uppercase">{PIX_TYPE_LABEL[pix.pix_key_type!]}</span>
                <span className="font-mono">{pix.pix_key}</span>
              </div>
            </div>
            <DSLabel className="text-xs">Valor (mín R$ 20)</DSLabel>
            <DSInput className="mt-1" inputMode="decimal" value={wAmount} onChange={(e) => setWAmount(e.target.value)} placeholder="0,00" autoFocus />
            <div className="mt-1 text-[11px] text-muted-foreground">Saldo disponível: {formatBRL(available)}</div>
            <DSButton className="mt-4 w-full" onClick={requestWithdraw} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Confirmar saque
            </DSButton>
            <div className="mt-2 text-center text-[10px] text-muted-foreground">
              Pix processado em segundos. Se falhar, o valor volta automaticamente ao seu saldo.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Withdrawal["status"] }) {
  const map = {
    pending:    { label: "Pendente",    cls: "bg-muted text-muted-foreground", Icon: Clock },
    processing: { label: "Processando", cls: "bg-amber-500/15 text-amber-500", Icon: RefreshCw },
    paid:       { label: "Pago",        cls: "bg-primary/15 text-primary",     Icon: CheckCircle2 },
    failed:     { label: "Falhou",      cls: "bg-destructive/15 text-destructive", Icon: XCircle },
    cancelled:  { label: "Cancelado",   cls: "bg-muted text-muted-foreground", Icon: XCircle },
  }[status];
  return (
    <span className={"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase " + map.cls}>
      <map.Icon className="h-3 w-3" /> {map.label}
    </span>
  );
}
