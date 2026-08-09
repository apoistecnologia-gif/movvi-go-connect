import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CreditCard, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { DSBadge, DSButton, DSCard, DSCardContent, Loading } from "@/design-system";
import { getAdminFinanceSummary, type AdminFinanceSummary } from "@/lib/adminFinance";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/pagamentos")({
  head: () => ({ meta: [{ title: "Pagamentos — Admin APOIS" }] }),
  component: AdminPaymentsPage,
});

function providerLabel(value: string | null) {
  if (!value) return "Não configurado";
  return value;
}

function AdminPaymentsPage() {
  const [summary, setSummary] = useState<AdminFinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      setSummary(await getAdminFinanceSummary(start, now));
    } catch (error) {
      setSummary(null);
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível consultar os provedores financeiros.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

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
          className="gap-1"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </DSButton>
      }
    >
      {loading ? (
        <Loading label="Consultando configuração financeira..." />
      ) : (
        <>
          <DSCard className="mb-4 border-primary/20 bg-primary/5">
            <DSCardContent className="flex gap-3 p-4 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="font-semibold text-foreground">
                  Credenciais não são editadas pelo navegador
                </p>
                <p className="mt-1">
                  API keys, webhook secrets e credenciais de payout pertencem à
                  infraestrutura/Secrets. O painel mostra apenas o provedor que o backend canônico
                  reconhece como fonte de verdade.
                </p>
              </div>
            </DSCardContent>
          </DSCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <ProviderCard
              icon={CreditCard}
              title="Pagamento eletrônico de corridas"
              value={summary?.providers.electronic_payment_provider ?? null}
              description="Usado para Pix/cartão somente quando o backend estiver explicitamente configurado para esse provedor."
            />
            <ProviderCard
              icon={WalletCards}
              title="Payout para motoristas"
              value={summary?.providers.payout_provider ?? null}
              description="Usado para processar saques somente quando houver provedor de payout explicitamente configurado."
            />
          </div>

          {!summary?.providers.electronic_payment_provider && (
            <DSCard className="mt-4 border-amber-500/20 bg-amber-500/5">
              <DSCardContent className="p-4 text-sm text-muted-foreground">
                Pagamento eletrônico de corridas permanece indisponível enquanto o backend não tiver
                um provedor configurado. O painel não considera o simples nome de uma secret ou uma
                linha de gateway como prova de integração funcional.
              </DSCardContent>
            </DSCard>
          )}
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
  const configured = Boolean(value);
  return (
    <DSCard>
      <DSCardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{title}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
          </div>
          <DSBadge variant={configured ? "success" : "muted"}>
            {configured ? "Configurado" : "Indisponível"}
          </DSBadge>
        </div>
        <div className="rounded-lg border border-border bg-background/40 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Provedor canônico
          </p>
          <p className="mt-1 font-mono text-sm text-foreground">{providerLabel(value)}</p>
        </div>
      </DSCardContent>
    </DSCard>
  );
}
