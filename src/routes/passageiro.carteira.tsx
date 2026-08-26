import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, Wallet as WalletIcon, ArrowLeft, MapPin, ShieldAlert, Copy, X, CheckCircle2 } from "lucide-react";
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
    meta: [{ title: "Carteira — APOIS" }, { name: "description", content: "Sua carteira APOIS e histórico de cobranças." }],
  }),
});

type PixCharge = {
  feeId: string;
  amount: number;
  qrCode: string | null;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
  expiresAt: string | null;
};

function PassengerWalletPage() {
  const navigate = useNavigate();
  const [wallet, setWallet] = useState<PassengerWallet | null>(null);
  const [fees, setFees] = useState<CancellationFee[]>([]);
  const [loading, setLoading] = useState(true);
  const [pix, setPix] = useState<PixCharge | null>(null);
  const [generating, setGenerating] = useState(false);

  async function refresh() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate({ to: "/passageiro/login" }); return; }
    const [w, f] = await Promise.all([
      getPassengerWallet(user.id),
      listPassengerFees(user.id),
    ]);
    setWallet(w);
    setFees(f);
    setLoading(false);
  }

  useEffect(() => {
    let alive = true;
    (async () => { if (alive) await refresh(); })();
    // Realtime: quando o webhook liquidar a multa, a carteira desbloqueia sozinha.
    const channel = supabase
      .channel("passenger-wallet-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "passenger_wallets" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "cancellation_fees" }, () => refresh())
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generatePix(feeId?: string) {
    if (generating) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke<PixCharge & { ok: boolean; error?: string }>(
        "create-cancellation-fee-charge",
        { body: feeId ? { feeId } : {} },
      );
      if (error) throw error;
      if (!data || (data as { error?: string }).error) throw new Error((data as { error?: string })?.error ?? "erro_desconhecido");
      setPix({
        feeId: data.feeId,
        amount: Number(data.amount),
        qrCode: data.qrCode,
        qrCodeBase64: data.qrCodeBase64,
        ticketUrl: data.ticketUrl,
        expiresAt: data.expiresAt,
      });
    } catch (e) {
      toast.error("Não foi possível gerar o Pix", { description: (e as Error).message });
    } finally {
      setGenerating(false);
    }
  }

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
              disabled={generating}
              onClick={() => generatePix()}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generating ? "Gerando Pix…" : `Pagar agora ${formatBRL(unpaidTotal)}`}
            </button>
          )}
          {unpaidTotal > 0 && (
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Pagamento via Pix — Mercado Pago. Sua conta desbloqueia automaticamente após a confirmação.
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
                  {!f.is_paid && (
                    <button
                      type="button"
                      disabled={generating}
                      onClick={() => generatePix(f.id)}
                      className="mt-1 h-9 w-full rounded-lg border border-primary/40 bg-primary/10 text-[12.5px] font-semibold text-primary transition hover:bg-primary/15 disabled:opacity-60"
                    >
                      {generating ? "Gerando Pix…" : "Pagar esta multa via Pix"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {pix && (
        <PixSheet
          pix={pix}
          onClose={() => setPix(null)}
        />
      )}
    </div>
  );
}

function PixSheet({ pix, onClose }: { pix: PixCharge; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!pix.qrCode) return;
    try {
      await navigator.clipboard.writeText(pix.qrCode);
      setCopied(true);
      toast.success("Código Pix copiado");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar");
    }
  }
  const expires = pix.expiresAt ? new Date(pix.expiresAt) : null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" role="dialog" aria-modal>
      <div className="w-full max-w-md rounded-t-3xl bg-card p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold">Pague com Pix</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-muted" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="rounded-2xl border border-border bg-background p-4">
          <div className="text-center text-xs uppercase tracking-wide text-muted-foreground">Valor</div>
          <div className="mt-1 text-center text-2xl font-bold">{formatBRL(pix.amount)}</div>
          {pix.qrCodeBase64 && (
            <div className="mt-3 flex justify-center">
              <img
                src={`data:image/png;base64,${pix.qrCodeBase64}`}
                alt="QR Code Pix"
                className="h-56 w-56 rounded-lg border border-border bg-white p-2"
              />
            </div>
          )}
          {pix.qrCode && (
            <>
              <div className="mt-3 rounded-lg bg-muted/60 p-2 text-[10.5px] font-mono break-all leading-snug">
                {pix.qrCode}
              </div>
              <button
                type="button"
                onClick={copy}
                className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
              >
                {copied ? <><CheckCircle2 className="h-4 w-4" /> Copiado</> : <><Copy className="h-4 w-4" /> Copiar código Pix</>}
              </button>
            </>
          )}
          {pix.ticketUrl && (
            <a
              href={pix.ticketUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block text-center text-xs font-medium text-primary underline"
            >
              Abrir no Mercado Pago
            </a>
          )}
          {expires && (
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Expira em {expires.toLocaleString("pt-BR")}
            </p>
          )}
        </div>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Assim que o Mercado Pago confirmar o pagamento, sua conta desbloqueia automaticamente.
        </p>
      </div>
    </div>
  );
}

