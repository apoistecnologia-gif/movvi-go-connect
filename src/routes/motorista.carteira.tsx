import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Wallet as WalletIcon, ArrowLeft, Clock, CheckCircle2, Crown, AlertTriangle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listDriverWalletTx,
  formatBRL,
  type DriverWalletTx,
} from "@/lib/wallet/wallet";

type DriverFinancial = {
  financial_status: "inactive" | "pending" | "active" | "overdue" | "cancelled";
  subscription_value: number | null;
  next_due_date: string | null;
  last_invoice_url: string | null;
  asaas_subscription_id: string | null;
};

export const Route = createFileRoute("/motorista/carteira")({
  component: DriverWalletPage,
  head: () => ({
    meta: [{ title: "Carteira — MOVVI" }, { name: "description", content: "Seus créditos MOVVI." }],
  }),
});

function DriverWalletPage() {
  const navigate = useNavigate();
  const [tx, setTx] = useState<DriverWalletTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [fin, setFin] = useState<DriverFinancial | null>(null);

  useEffect(() => {
    let alive = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate({ to: "/motorista/login" }); return; }
      const rows = await listDriverWalletTx(user.id);
      const { data: drv } = await supabase
        .from("drivers")
        .select("financial_status, subscription_value, next_due_date, last_invoice_url, asaas_subscription_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!alive) return;
      setFin((drv as unknown as DriverFinancial | null) ?? null);
      if (!alive) return;
      setTx(rows);
      setLoading(false);

      channel = supabase
        .channel(`driver-wallet-${user.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "driver_wallet_transactions", filter: `driver_id=eq.${user.id}` },
          (payload) => {
            const t = payload.new as DriverWalletTx;
            setTx((prev) => [t, ...prev]);
            if (t.source === "cancellation_fee") {
              toast.success(`Novo crédito: ${formatBRL(Number(t.amount))}`, {
                description: t.status === "pending"
                  ? "Aguardando pagamento do passageiro."
                  : "Já disponível para desconto na mensalidade.",
              });
            }
          },
        )
        .subscribe();
    })();
    return () => {
      alive = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [navigate]);


  const { pending, available } = useMemo(() => {
    let p = 0, a = 0;
    for (const t of tx) {
      if (t.status === "pending") p += Number(t.amount);
      if (t.status === "available") a += Number(t.amount);
    }
    return { pending: p, available: a };
  }, [tx]);

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
          <section
            className={
              "rounded-2xl border p-4 " +
              (fin.financial_status === "active"
                ? "border-primary/30 bg-primary/5"
                : fin.financial_status === "overdue"
                ? "border-destructive/40 bg-destructive/10"
                : "border-border bg-card")
            }
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {fin.financial_status === "overdue" ? (
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                ) : (
                  <Crown className="h-4 w-4 text-primary" />
                )}
                <div className="text-sm font-semibold">Mensalidade MOVVI</div>
              </div>
              <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                {fin.financial_status === "active"
                  ? "Ativa"
                  : fin.financial_status === "pending"
                  ? "Pendente"
                  : fin.financial_status === "overdue"
                  ? "Inadimplente"
                  : fin.financial_status === "cancelled"
                  ? "Cancelada"
                  : "Inativa"}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <div className="text-2xl font-bold">
                {formatBRL(Number(fin.subscription_value ?? 49.9))}
              </div>
              <div className="text-xs text-muted-foreground">/ mês</div>
            </div>
            {fin.next_due_date && (
              <div className="mt-1 text-xs text-muted-foreground">
                Próximo vencimento:{" "}
                {new Date(fin.next_due_date + "T00:00:00").toLocaleDateString("pt-BR")}
              </div>
            )}
            {(fin.financial_status === "pending" || fin.financial_status === "overdue") && (
              <a
                href={fin.last_invoice_url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className={
                  "mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold " +
                  (fin.last_invoice_url
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted text-muted-foreground pointer-events-none")
                }
              >
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
            <div className="mt-1 text-[10px] text-muted-foreground">Vira desconto na mensalidade</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> Pendente
            </div>
            <div className="mt-1 text-xl font-bold text-foreground">{formatBRL(pending)}</div>
            <div className="mt-1 text-[10px] text-muted-foreground">Aguardando pagamento do passageiro</div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <WalletIcon className="h-4 w-4" /> Histórico
          </h2>
          {loading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Carregando…</div>
          ) : tx.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Nenhum crédito ainda.</div>
          ) : (
            <ul className="divide-y divide-border">
              {tx.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="text-sm font-medium">
                      {t.description ?? "Crédito"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(t.created_at).toLocaleString("pt-BR")}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-primary">+{formatBRL(Number(t.amount))}</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t.status === "pending" ? "Pendente" : t.status === "available" ? "Disponível" : t.status}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
