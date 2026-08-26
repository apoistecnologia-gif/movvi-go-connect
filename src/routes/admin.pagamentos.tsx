import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CreditCard, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { DSBadge, DSButton, DSCard, DSCardContent, Loading } from "@/design-system";
import { getAdminFinanceSummary, type AdminFinanceSummary } from "@/lib/adminFinance";

export const Route = createFileRoute("/admin/pagamentos")({
  head: () => ({ meta: [{ title: "Pagamentos — Admin APOIS" }] }),
  component: AdminPaymentsPage,
});

function cleanProvider(value: unknown) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (!text || ["null", "undefined", "none"].includes(text.toLowerCase())) return null;
  return text;
}

function providerLabel(value: unknown) {
  return cleanProvider(value) ?? "Não configurado";
}

function AdminPaymentsPage() {
  const [summary, setSummary] = useState<AdminFinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestRef = useRef(0);

  async function load() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const next = await getAdminFinanceSummary(start, now);
      if (requestId !== requestRef.current) return;
      setSummary(next);
    } catch (error) {
      if (requestId !== requestRef.current) return;
      setSummary(null);
      setLoadError("Não foi possível consultar a configuração financeira agora. Tente novamente.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao consultar provedores financeiros", error);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      requestRef.current += 1;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const electronicProvider = cleanProvider(summary?.providers.electronic_payment_provider);
  const payoutProvider = cleanProvider(summary?.providers.payout_provider);

  return (
    <AdminLayout
      title="Pagamentos"
      description="Estado canônico dos provedores financeiros usados pelo APOIS Corridas."
      actions={
        <DSButton
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
          className="min-h-11 gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-busy={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
          {loading ? "Atualizando…" : "Atualizar"}
        </DSButton>
      }
    >
      {loading ? (
        <div aria-live="polite"><Loading label="Consultando configuração financeira..." /></div>
      ) : loadError ? (
        <DSCard className="border-destructive/30 bg-destructive/5">
          <DSCardContent className="space-y-3 p-4" role="alert">
            <p className="text-sm font-medium text-destructive">{loadError}</p>
            <DSButton variant="outline" className="min-h-11 gap-2" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Tentar novamente
            </DSButton>
          </DSCardContent>
        </DSCard>
      ) : (
        <>
          <DSCard className="mb-4 border-primary/20 bg-primary/5">
            <DSCardContent className="flex min-w-0 gap-3 p-4 text-sm leading-6 text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-semibold text-foreground">
                  Credenciais não são editadas pelo navegador
                </p>
                <p className="mt-1 break-words">
                  API keys, webhook secrets e credenciais de payout pertencem à infraestrutura e aos
                  Secrets. Esta tela exibe somente nomes de provedores reconhecidos pelo backend.
                  Um provedor definido aqui <strong>não significa</strong> que payout esteja habilitado:
                  gates e homologação do backend continuam prevalecendo.
                </p>
              </div>
            </DSCardContent>
          </DSCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <ProviderCard
              icon={CreditCard}
              title="Pagamento eletrônico de corridas"
              value={electronicProvider}
              description="Usado para Pix/cartão somente quando o backend estiver explicitamente configurado e o fluxo correspondente estiver habilitado."
            />
            <ProviderCard
              icon={WalletCards}
              title="Payout para motoristas"
              value={payoutProvider}
              description="Indica apenas o provedor definido pelo backend. Solicitações e processamento continuam condicionados ao gate e à homologação de payout."
            />
          </div>

          {!electronicProvider ? (
            <DSCard className="mt-4 border-amber-500/20 bg-amber-500/5">
              <DSCardContent className="p-4 text-sm leading-6 text-muted-foreground" role="status">
                Pagamento eletrônico de corridas aparece como não configurado neste resumo. O painel
                não considera nome de secret, variável local ou registro isolado como prova de
                integração funcional.
              </DSCardContent>
            </DSCard>
          ) : null}
        </>
      )}
    </AdminLayout>
  );
}

function ProviderCard({
  icon: Icon,
  title,
  value,
  description,
}: {
  icon: typeof CreditCard;
  title: string;
  value: string | null;
  description: string;
}) {
  const configured = Boolean(cleanProvider(value));
  return (
    <DSCard>
      <DSCardContent className="min-w-0 space-y-3 p-4">
        <div className="flex min-w-0 flex-wrap items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1 basis-48">
            <p className="break-words font-semibold">{title}</p>
            <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          <DSBadge variant={configured ? "success" : "muted"}>
            {configured ? "Provedor definido" : "Não configurado"}
          </DSBadge>
        </div>
        <div className="min-w-0 rounded-lg border border-border bg-background/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Provedor canônico
          </p>
          <p className="mt-1 break-all font-mono text-sm text-foreground">{providerLabel(value)}</p>
        </div>
      </DSCardContent>
    </DSCard>
  );
}
