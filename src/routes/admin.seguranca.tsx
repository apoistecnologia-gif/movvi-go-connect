/* eslint-disable @typescript-eslint/no-explicit-any -- Temporary Phase 8 bridge until generated Supabase types include canonical admin RPCs. */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { KeyRound, Lock, RefreshCw, ScrollText, Shield, ShieldAlert, Users } from "lucide-react";
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

function safeCount(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function cleanText(value: unknown, fallback = "—") {
  const text = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  return text || fallback;
}

function AdminSecurityPage() {
  const [access, setAccess] = useState<AdminAccessContext | null>(null);
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [auditCount, setAuditCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const [nextAccess, nextMetrics, auditResult] = await Promise.all([
        loadAdminAccess(),
        getAdminDashboardMetrics().catch((error) => {
          if (import.meta.env.DEV) console.warn("[APOIS Admin] métricas de segurança indisponíveis", error);
          return null;
        }),
        (supabase as any).from("audit_logs").select("id", { count: "exact", head: true }),
      ]);
      if (requestId !== requestRef.current) return;
      setAccess(nextAccess);
      setMetrics(nextMetrics);
      setAuditCount(auditResult.error ? null : safeCount(auditResult.count));
    } catch (error) {
      if (requestId !== requestRef.current) return;
      setAccess(null);
      setMetrics(null);
      setAuditCount(null);
      setLoadError("Não foi possível verificar os controles de segurança agora. Tente novamente.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao carregar segurança", error);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, []);

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
  }, [load]);

  if (loading) {
    return (
      <AdminLayout title="Segurança">
        <div aria-live="polite"><Loading label="Verificando controles reais..." /></div>
      </AdminLayout>
    );
  }

  if (loadError) {
    return (
      <AdminLayout title="Segurança" description="Estado real de autorização, auditoria e incidentes do APOIS Corridas.">
        <DSCard className="border-destructive/30 bg-destructive/5">
          <DSCardContent className="space-y-3 p-4" role="alert">
            <p className="text-sm font-medium text-destructive">{loadError}</p>
            <DSButton variant="outline" className="min-h-11 gap-2" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Tentar novamente
            </DSButton>
          </DSCardContent>
        </DSCard>
      </AdminLayout>
    );
  }

  const permissionCount = new Set(access?.permissions ?? []).size;
  const openSos = safeCount(metrics?.operations.open_sos);

  return (
    <AdminLayout
      title="Segurança"
      description="Estado real de autorização, auditoria e incidentes do APOIS Corridas."
      actions={
        <DSButton variant="outline" size="sm" className="min-h-11 gap-2" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Atualizar
        </DSButton>
      }
    >
      <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
        Esta tela não expõe configurações fictícias de senha, 2FA ou timeout. Políticas do Supabase
        Auth só devem ser alteradas no backend/console autorizado. O painel mostra e opera apenas
        controles que existem no sistema.
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SecurityCard
          icon={Lock}
          title="RBAC administrativo"
          description="Acesso derivado de profiles.role → role_permissions, validado no backend."
          status={access?.authorized ? "Ativo" : "Indisponível"}
          ok={Boolean(access?.authorized)}
        >
          <p className="break-words text-sm text-muted-foreground">
            Função atual: <strong>{cleanText(access?.role)}</strong>
          </p>
          <p className="text-sm text-muted-foreground">
            Permissões: {permissionCount}
          </p>
          <DSButton asChild variant="outline" size="sm" className="min-h-11">
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
          <p className="text-sm text-muted-foreground">Eventos registrados: {auditCount ?? "—"}</p>
          <DSButton asChild variant="outline" size="sm" className="min-h-11">
            <Link to="/admin/logs">Abrir auditoria</Link>
          </DSButton>
        </SecurityCard>

        <SecurityCard
          icon={ShieldAlert}
          title="SOS operacional"
          description="Alertas de segurança entram na Central de Operações e permanecem auditáveis."
          status={openSos > 0 ? "Atenção" : "Sem alertas abertos"}
          ok={openSos === 0}
        >
          <p className="text-sm text-muted-foreground">
            SOS abertos/ack: {openSos}
          </p>
          <DSButton asChild variant="outline" size="sm" className="min-h-11">
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
          <p className="text-sm leading-5 text-muted-foreground">
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
          <p className="text-sm leading-5 text-muted-foreground">
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
          <p className="text-sm leading-5 text-muted-foreground">
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
    <DSCard className="min-w-0 border-border bg-card/60">
      <DSCardHeader className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-48">
            <DSCardTitle className="flex min-w-0 items-center gap-2 text-base">
              <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="break-words">{title}</span>
            </DSCardTitle>
            <DSCardDescription className="mt-2 break-words text-sm leading-5">{description}</DSCardDescription>
          </div>
          <StatusPill status={ok ? "online" : "searching"} label={cleanText(status, "Indisponível")} pulse={false} />
        </div>
      </DSCardHeader>
      <DSCardContent className="min-w-0 space-y-3">{children}</DSCardContent>
    </DSCard>
  );
}
