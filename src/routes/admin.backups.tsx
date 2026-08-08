import { createFileRoute } from "@tanstack/react-router";
import { Database, ShieldCheck, TriangleAlert } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { DSBadge, DSCard, DSCardContent, DSCardHeader, DSCardTitle } from "@/design-system";

export const Route = createFileRoute("/admin/backups")({
  head: () => ({ meta: [{ title: "Backups — Admin APOIS" }] }),
  component: AdminBackupsPage,
});

function AdminBackupsPage() {
  return (
    <AdminLayout
      title="Backups"
      description="Estado da proteção de dados do APOIS Corridas"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <DSCard className="border-primary/20 bg-primary/5">
          <DSCardHeader>
            <DSCardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Backup de banco não é CSV do navegador
            </DSCardTitle>
          </DSCardHeader>
          <DSCardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              O painel não exporta tabelas inteiras para o computador e não registra isso como se fosse um backup restaurável.
              Esse comportamento antigo foi removido porque não protegia Auth, Storage, funções, configurações nem garantia consistência transacional.
            </p>
            <DSBadge variant="success">Fluxo falso removido</DSBadge>
          </DSCardContent>
        </DSCard>

        <DSCard>
          <DSCardHeader>
            <DSCardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4 text-primary" />
              Fonte correta
            </DSCardTitle>
          </DSCardHeader>
          <DSCardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Backups e restauração do Supabase oficial devem ser tratados no plano de infraestrutura, com mecanismo próprio do provedor e procedimento testado de restore.
              O Admin da aplicação não possui credencial de Management API e não tenta simular essa capacidade.
            </p>
            <DSBadge variant="muted">Operação de infraestrutura</DSBadge>
          </DSCardContent>
        </DSCard>
      </div>

      <DSCard className="mt-4 border-amber-500/20 bg-amber-500/5">
        <DSCardContent className="flex gap-3 p-4 text-sm text-muted-foreground">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <p className="font-semibold text-foreground">Não há botão de restaurar dentro do aplicativo.</p>
            <p className="mt-1">
              Isso é intencional. Restore de banco é uma operação privilegiada e potencialmente destrutiva; só será exposto quando existir um processo de infraestrutura autenticado, auditável e testado fora do cliente web.
            </p>
          </div>
        </DSCardContent>
      </DSCard>
    </AdminLayout>
  );
}
