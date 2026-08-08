import { createFileRoute } from "@tanstack/react-router";
import { Ticket, ShieldAlert } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { DSBadge, DSCard, DSCardContent, EmptyState } from "@/design-system";

export const Route = createFileRoute("/admin/cupons")({
  head: () => ({ meta: [{ title: "Promoções — Admin APOIS" }] }),
  component: AdminPromocoesPage,
});

function AdminPromocoesPage() {
  return (
    <AdminLayout title="Promoções" description="Módulo comercial controlado — sem modelo paralelo de cupom">
      <DSCard className="mb-4 border-warning/30 bg-warning/5">
        <DSCardContent className="flex gap-3 p-4 text-sm text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div>
            <div className="mb-1 flex items-center gap-2">
              <p className="font-semibold text-foreground">Cupons permanecem desativados</p>
              <DSBadge variant="warning">Indisponível</DSBadge>
            </div>
            <p>
              O schema canônico atual do APOIS Corridas não possui entidade coupons. A implementação antiga dependia de uma tabela legada fora da fonte de verdade e foi retirada deste painel para evitar descontos fictícios ou divergência de preço.
            </p>
          </div>
        </DSCardContent>
      </DSCard>

      <EmptyState
        icon={Ticket}
        title="Nenhuma promoção operacional"
        description="Quando a regra promocional for definida no backend canônico e coberta pelo Fare Engine, este módulo poderá ser habilitado com segurança."
      />
    </AdminLayout>
  );
}
