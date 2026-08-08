import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, Lock, ScrollText, Shield, ShieldAlert, Users } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { loadAdminAccess, type AdminAccessContext } from "@/lib/adminAccess";
import { getAdminDashboardMetrics, type AdminDashboardMetrics } from "@/lib/adminControlPlane";
import {
  DSButton,
  DSCard,
  DSCardContent,
  DSCardDescription,
  DSCardHeader,
  DSCardTitle,
  Loading,
  StatusPill,
} from "@/design-system";

export const Route = createFileRoute("/admin/seguranca")({
  head: () => ({ meta: [{ title: "Segurança — Admin APOIS" }] }),
  component: AdminSecurityPage,
});

function AdminSecurityPage() {
  const [access, setAccess] = useState<AdminAccessContext | null>(null);
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [auditCount, setAuditCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [nextAccess, nextMetrics, auditResult] = await Promise.all([
        loadAdminAccess(),
        getAdminDashboardMetrics().catch(() => null),
        (supabase as any).from("audit_logs").select("id", { count: "exact", head: true }),
      ]);
      if (!alive) return;
      setAccess(nextAccess);
      setMetrics(nextMetrics);
      setAuditCount(auditResult.error ? null : auditResult.count ?? 0);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <AdminLayout title="Segurança">
        <Loading label="Verificando controles reais..." />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Segurança"
      description="Estado real de autorização, auditoria e incidentes do APOIS Corridas."
    >
      <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
        Esta tela não expõe configurações fictícias de senha, 2FA ou timeout. Políticas do Supabase Auth só devem ser alteradas no backend/console autorizado. O painel mostra e opera apenas controles que existem no sistema.
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SecurityCard
          icon={Lock}
          title="RBAC administrativo"
          description="Acesso derivado de profiles.role → role_permissions, validado no backend."
          status={access?.authorized ? "Ativo" : "Indisponível"}
          ok={Boolean(access?.authorized)}
        >
          <p className="text-xs text-muted-foreground">Função atual: <strong>{access?.role ?? "—"}</strong></p>
          <p className="text-xs text-muted-foreground">Permissões: {access?.permissions.length ?? 0}</p>
          <DSButton asChild variant="outline" size="sm">
            <Link to="/admin/administradores">Gerenciar equipe</Link>
          </DSButton>
        </SecurityCard>

        <SecurityCard
          icon={ScrollText}
          title="Auditoria server-side"
          description="Ações críticas escrevem em public.audit_logs pelo backend/RPC."
          status={auditCount == null ? "Sem leitura" : "Ativa"}
          ok={auditCount != null}
        >
          <p className="text-xs text-muted-foreground">Eventos registrados: {auditCount ?? "—"}</p>
          <DSButton asChild variant="outline" size="sm">
            <Link to="/admin/logs">Abrir auditoria</Link>
          </DSButton>
        </SecurityCard>

        <SecurityCard
          icon={ShieldAlert}
          title="SOS operacional"
          description="Alertas de segurança entram na Central de Operações e permanecem auditáveis."
          status={(metrics?.operations.open_sos ?? 0) > 0 ? "Atenção" : "Sem alertas abertos"}
          ok={(metrics?.operations.open_sos ?? 0) === 0}
        >
          <p className="text-xs text-muted-foreground">SOS abertos/ack: {metrics?.operations.open_sos ?? 0}</p>
          <DSButton asChild variant="outline" size="sm">
            <Link to="/admin/operacoes">Central de Operações</Link>
          </DSButton>
        </SecurityCard>

        <SecurityCard
          icon={Users}
          title="Identidade separada"
          description="Passageiro/Motorista não recebe acesso Admin por possuir mobility role."
          status="Protegida"
          ok
        >
          <p className="text-xs text-muted-foreground">
            O painel não usa user_roles como autoridade administrativa.
          </p>
        </SecurityCard>

        <SecurityCard
          icon={KeyRound}
          title="Credenciais e 2FA"
          description="Configuração pertence ao Supabase Auth e não é simulada por uma tabela local."
          status="Backend/Console"
          ok
        >
          <p className="text-xs text-muted-foreground">
            Nenhuma chave, segredo ou política de senha é gravada pelo navegador do Admin.
          </p>
        </SecurityCard>

        <SecurityCard
          icon={Shield}
          title="Princípio de menor privilégio"
          description="Navegação é filtrada por permissão e mutações críticas voltam a ser validadas no backend."
          status="Aplicado"
          ok
        >
          <p className="text-xs text-muted-foreground">
            O frontend é apenas UX; a autorização efetiva permanece nas RPCs/RLS.
          </p>
        </SecurityCard>
      </div>
    </AdminLayout>
  );
}

function SecurityCard({
  icon: Icon,
  title,
  description,
  status,
  ok,
  children,
}: {
  icon: typeof Shield;
  title: string;
  description: string;
  status: string;
  ok: boolean;
  children: React.ReactNode;
}) {
  return (
    <DSCard className="border-border bg-card/60">
      <DSCardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <DSCardTitle className="flex items-center gap-2 text-base">
              <Icon className="h-4 w-4 text-primary" /> {title}
            </DSCardTitle>
            <DSCardDescription className="mt-2 text-xs">{description}</DSCardDescription>
          </div>
          <StatusPill status={ok ? "online" : "searching"} label={status} />
        </div>
      </DSCardHeader>
      <DSCardContent className="space-y-3">{children}</DSCardContent>
    </DSCard>
  );
}
