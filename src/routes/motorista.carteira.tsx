import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Wallet as WalletIcon, ArrowLeft, Clock, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  listDriverWalletTx,
  formatBRL,
  type DriverWalletTx,
} from "@/lib/wallet/wallet";

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

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate({ to: "/motorista/login" }); return; }
      const rows = await listDriverWalletTx(user.id);
      if (!alive) return;
      setTx(rows);
      setLoading(false);
    })();
    return () => { alive = false; };
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
