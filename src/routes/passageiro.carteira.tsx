import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, Wallet as WalletIcon, ArrowLeft, MapPin, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getPassengerWallet,
  listPassengerFees,
  formatBRL,
  feeReasonLabel,
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
  const unpaidTotal = fees.filter((f) => !f.is_paid).reduce((s, f) => s + Number(f.fee_amount), 0);

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <button onClick={() => navigate({ to: "/passageiro/app" })} className="rounded-full p-2 hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold">Minha Carteira</h1>
      </header>

      <main className="mx-auto max-w-md space-y-4 p-4">
        {isBlocked && (
          <section className="overflow-hidden rounded-2xl border-2 border-destructive bg-destructive/10 shadow-sm">
            <div className="flex items-start gap-3 p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold text-destructive">Conta bloqueada</div>
                <p className="mt-1 text-sm leading-snug text-destructive/90">
                  Você tem uma multa de cancelamento em aberto no valor de{" "}
                  <strong>{formatBRL(unpaidTotal)}</strong>. Regularize para voltar a solicitar corridas.
                </p>
              </div>
            </div>
          </section>
        )}

        <section className={`rounded-2xl border p-5 shadow-sm ${isBlocked ? "border-destructive/40 bg-card" : "border-border bg-card"}`}>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <WalletIcon className="h-4 w-4" /> Saldo
          </div>
          <div className={`mt-2 text-3xl font-bold ${balance < 0 ? "text-destructive" : "text-foreground"}`}>
            {loading ? "…" : formatBRL(balance)}
          </div>
          {unpaidTotal > 0 && (
            <button
              type="button"
              disabled
              onClick={() => toast.info("Pagamento via PIX estará disponível em breve.")}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              Pagar agora {formatBRL(unpaidTotal)}
            </button>
          )}
          {unpaidTotal > 0 && (
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Pagamento via PIX estará disponível em breve.
            </p>
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
                <li key={f.id} className="space-y-2 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm font-semibold">
                        <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                        Multa de cancelamento
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {new Date(f.created_at).toLocaleString("pt-BR")}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold ${f.is_paid ? "text-muted-foreground line-through" : "text-destructive"}`}>
                        -{formatBRL(f.fee_amount)}
                      </div>
                      <div className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${f.is_paid ? "bg-muted text-muted-foreground" : "bg-destructive/15 text-destructive"}`}>
                        {f.is_paid ? "Paga" : "Pendente"}
                      </div>
                    </div>
                  </div>
                  {f.ride && (f.ride.origin_name || f.ride.destination_name) && (
                    <div className="rounded-lg bg-muted/40 p-2.5 text-[12px] leading-snug">
                      {f.ride.origin_name && (
                        <div className="flex items-start gap-1.5">
                          <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                          <span className="truncate"><strong>De:</strong> {f.ride.origin_name}</span>
                        </div>
                      )}
                      {f.ride.destination_name && (
                        <div className="mt-1 flex items-start gap-1.5">
                          <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
                          <span className="truncate"><strong>Para:</strong> {f.ride.destination_name}</span>
                        </div>
                      )}
                      {(f.ride.final_price ?? f.ride.estimated_price) != null && (
                        <div className="mt-1 text-muted-foreground">
                          Valor previsto da corrida: {formatBRL(Number(f.ride.final_price ?? f.ride.estimated_price ?? 0))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="text-[11.5px] text-muted-foreground">
                    <strong>Motivo:</strong> {feeReasonLabel(f)}
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
