import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, Wallet as WalletIcon, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getPassengerWallet,
  listPassengerFees,
  formatBRL,
  type PassengerWallet,
  type CancellationFee,
} from "@/lib/wallet/wallet";

export const Route = createFileRoute("/passageiro/carteira")({
  component: PassengerWalletPage,
  head: () => ({
    meta: [{ title: "Carteira — MOVVI" }, { name: "description", content: "Sua carteira MOVVI e histórico de cobranças." }],
  }),
});

function PassengerWalletPage() {
  const navigate = useNavigate();
  const [wallet, setWallet] = useState<PassengerWallet | null>(null);
  const [fees, setFees] = useState<CancellationFee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate({ to: "/passageiro/login" }); return; }
      const [w, f] = await Promise.all([
        getPassengerWallet(user.id),
        listPassengerFees(user.id),
      ]);
      if (!alive) return;
      setWallet(w);
      setFees(f);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [navigate]);

  const balance = wallet?.balance ?? 0;
  const isBlocked = wallet?.is_blocked ?? false;

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <button onClick={() => navigate({ to: "/passageiro/app" })} className="rounded-full p-2 hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold">Minha Carteira</h1>
      </header>

      <main className="mx-auto max-w-md space-y-4 p-4">
        <section className={`rounded-2xl p-5 shadow-sm ${isBlocked ? "bg-destructive/10 border border-destructive/30" : "bg-card border border-border"}`}>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <WalletIcon className="h-4 w-4" /> Saldo
          </div>
          <div className={`mt-2 text-3xl font-bold ${balance < 0 ? "text-destructive" : "text-foreground"}`}>
            {loading ? "…" : formatBRL(balance)}
          </div>
          {isBlocked && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-destructive/15 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <strong>Conta bloqueada.</strong> Você tem uma multa de cancelamento em aberto. Regularize para voltar a solicitar corridas.
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Histórico de cobranças</h2>
          {loading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Carregando…</div>
          ) : fees.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Nenhuma multa registrada. 🎉</div>
          ) : (
            <ul className="divide-y divide-border">
              {fees.map((f) => (
                <li key={f.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="text-sm font-medium">Multa de cancelamento</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(f.created_at).toLocaleString("pt-BR")}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-semibold ${f.is_paid ? "text-muted-foreground line-through" : "text-destructive"}`}>
                      -{formatBRL(f.fee_amount)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {f.is_paid ? "Paga" : "Pendente"}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-center text-xs text-muted-foreground">
          Pagamento via PIX estará disponível em breve.
        </p>
      </main>
    </div>
  );
}
