/* eslint-disable @typescript-eslint/no-explicit-any -- Temporary Phase 8 bridge until generated Supabase types include canonical admin RPCs. */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, FileBarChart, Loader2, RefreshCw } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { loadAdminAccess, type AdminAccessContext } from "@/lib/adminAccess";
import { downloadCsv } from "@/lib/csvExport";
import {
  DSButton,
  DSCard,
  DSCardContent,
  DSCardHeader,
  DSCardTitle,
  EmptyState,
  Loading,
} from "@/design-system";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — Admin APOIS" }] }),
  component: AdminRelatoriosPage,
});

type ReportKey =
  | "drivers"
  | "passengers"
  | "rides"
  | "settlements"
  | "withdrawals"
  | "categories"
  | "support";

type ReportDef = {
  key: ReportKey;
  permission: string;
  label: string;
  description: string;
  load: () => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
};

function safeExportValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const normalized = value.replace(/\u0000/g, "");
  return /^[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
}

function sanitizeRows(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) return [];
  return data
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    .map((row) =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key, safeExportValue(value)])),
    );
}

function AdminRelatoriosPage() {
  const [busy, setBusy] = useState<ReportKey | null>(null);
  const [access, setAccess] = useState<AdminAccessContext | null>(null);
  const [loadingAccess, setLoadingAccess] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const accessRequestRef = useRef(0);
  const mountedRef = useRef(true);
  const db = supabase as any;

  const refreshAccess = useCallback(async () => {
    const requestId = ++accessRequestRef.current;
    setLoadingAccess(true);
    setAccessError(null);
    try {
      const next = await loadAdminAccess();
      if (!mountedRef.current || requestId !== accessRequestRef.current) return;
      setAccess(next);
      if (!next?.authorized) {
        setAccessError("Seu acesso administrativo não está ativo para consultar relatórios.");
      }
    } catch (error) {
      if (!mountedRef.current || requestId !== accessRequestRef.current) return;
      setAccess(null);
      setAccessError("Não foi possível verificar suas permissões agora. Tente novamente.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao carregar acesso de relatórios", error);
    } finally {
      if (mountedRef.current && requestId === accessRequestRef.current) setLoadingAccess(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refreshAccess();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshAccess();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mountedRef.current = false;
      accessRequestRef.current += 1;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshAccess]);

  const reports = useMemo<ReportDef[]>(
    () => [
      {
        key: "drivers",
        permission: "drivers.read",
        label: "Motoristas",
        description: "Cadastro, aprovação, assinatura, presença e avaliação.",
        load: async () =>
          db
            .from("drivers")
            .select(
              "id,user_id,name,email,phone,city,state,category,approval_status,documents_status,subscription_status,is_online,rating,total_ratings,created_at,updated_at",
            )
            .limit(10000),
      },
      {
        key: "passengers",
        permission: "passengers.read",
        label: "Passageiros",
        description: "Cadastro e estado operacional canônico.",
        load: async () =>
          db
            .from("users")
            .select(
              "id,auth_user_id,name,email,phone,city,average_rating,total_ratings,completed_rides,blocked_at,block_reason,suspended_at,deleted_at,created_at,updated_at",
            )
            .limit(10000),
      },
      {
        key: "rides",
        permission: "rides.read",
        label: "Corridas",
        description: "Ciclo de vida, rota, preço e pagamento declarado.",
        load: async () =>
          db
            .from("rides")
            .select(
              "id,passenger_id,driver_id,category,status,origin_name,destination_name,distance_km,duration_min,estimated_price,final_price,payment_method,dispatch_attempts,accepted_at,driver_arrived_at,started_at,completed_at,cancelled_at,created_at",
            )
            .limit(10000),
      },
      {
        key: "settlements",
        permission: "finance.read",
        label: "Settlements",
        description: "GMV, ganhos do motorista, receita APOIS, taxas e estornos.",
        load: async () =>
          db
            .from("ride_settlements")
            .select(
              "id,ride_id,passenger_id,driver_id,passenger_charge_cents,driver_earning_cents,platform_fee_cents,payment_provider_fee_cents,refunded_amount_cents,payment_method,payment_status,status,created_at,settled_at",
            )
            .limit(10000),
      },
      {
        key: "withdrawals",
        permission: "finance.read",
        label: "Saques de motoristas",
        description: "Solicitações, processamento e resultado de payout.",
        load: async () =>
          db
            .from("driver_withdrawals")
            .select(
              "id,driver_id,amount,status,provider,provider_transfer_id,failure_reason,requested_at,processed_at,updated_at",
            )
            .limit(10000),
      },
      {
        key: "categories",
        permission: "pricing.read",
        label: "Categorias",
        description: "Domínio comercial oficial das categorias de corrida.",
        load: async () =>
          db
            .from("ride_categories")
            .select(
              "id,code,name,description,capacity_label,eta_label,sort_order,is_active,created_at,updated_at",
            )
            .limit(1000),
      },
      {
        key: "support",
        permission: "support.read",
        label: "Suporte passageiro",
        description: "Tickets reais da entidade passenger_support_tickets.",
        load: async () =>
          db
            .from("passenger_support_tickets")
            .select(
              "id,protocol,passenger_id,ride_id,category,subject,status,priority,created_at,updated_at",
            )
            .limit(10000),
      },
    ],
    [db],
  );

  const visibleReports = useMemo(() => {
    const permissions = new Set(access?.permissions ?? []);
    return reports.filter((report) => permissions.has(report.permission));
  }, [access, reports]);

  async function generate(report: ReportDef) {
    if (busy) return;
    if (!access?.authorized || !access.permissions.includes(report.permission)) {
      setExportError("Sua função administrativa não possui permissão para este relatório.");
      return;
    }
    setBusy(report.key);
    setExportError(null);
    try {
      const result = await report.load();
      if (result.error) throw result.error;
      const rows = sanitizeRows(result.data);
      if (!rows.length) {
        toast.info("Nenhum dado encontrado para este relatório.");
        return;
      }
      const date = new Date().toISOString().slice(0, 10);
      downloadCsv(`apois-${report.key}-${date}`, rows);
      toast.success(`${rows.length} ${rows.length === 1 ? "linha exportada" : "linhas exportadas"}.`);
    } catch (error) {
      setExportError("Não foi possível gerar este relatório agora. Tente novamente.");
      if (import.meta.env.DEV) console.warn(`[APOIS Admin] falha ao exportar ${report.key}`, error);
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminLayout
      title="Relatórios"
      description="Exportações CSV das entidades canônicas do APOIS Corridas"
      actions={
        <DSButton
          variant="outline"
          size="sm"
          className="min-h-11 gap-2"
          onClick={() => void refreshAccess()}
          disabled={loadingAccess || Boolean(busy)}
          aria-busy={loadingAccess}
        >
          <RefreshCw className={`h-4 w-4 ${loadingAccess ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
          Atualizar acesso
        </DSButton>
      }
    >
      <DSCard className="mb-4 border-primary/20 bg-primary/5">
        <DSCardContent className="p-4 text-sm leading-6 text-muted-foreground">
          Relatórios financeiros usam <strong>ride_settlements</strong> e{" "}
          <strong>driver_withdrawals</strong>. Cada exportação aparece somente quando a função
          administrativa possui a permissão de leitura correspondente. Valores de texto são
          neutralizados contra fórmulas de planilha antes da geração do CSV.
        </DSCardContent>
      </DSCard>

      {exportError ? (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
          {exportError}
        </div>
      ) : null}

      {loadingAccess ? (
        <div aria-live="polite"><Loading label="Verificando permissões dos relatórios..." /></div>
      ) : accessError ? (
        <DSCard className="border-destructive/30 bg-destructive/5">
          <DSCardContent className="space-y-3 p-4" role="alert">
            <p className="text-sm text-destructive">{accessError}</p>
            <DSButton variant="outline" className="min-h-11" onClick={() => void refreshAccess()}>
              Tentar novamente
            </DSButton>
          </DSCardContent>
        </DSCard>
      ) : visibleReports.length === 0 ? (
        <EmptyState
          icon={FileBarChart}
          title="Nenhum relatório permitido"
          description="Sua função administrativa não possui acesso aos conjuntos de dados desta seção."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {visibleReports.map((report) => {
            const reportBusy = busy === report.key;
            return (
              <DSCard key={report.key}>
                <DSCardHeader className="min-w-0">
                  <DSCardTitle className="flex min-w-0 items-center gap-2 text-base">
                    <FileBarChart className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="break-words">{report.label}</span>
                  </DSCardTitle>
                  <p className="break-words text-sm leading-5 text-muted-foreground">{report.description}</p>
                </DSCardHeader>
                <DSCardContent>
                  <DSButton
                    onClick={() => void generate(report)}
                    disabled={Boolean(busy)}
                    className="min-h-11 w-full gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-busy={reportBusy}
                  >
                    {reportBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    ) : (
                      <Download className="h-4 w-4" aria-hidden="true" />
                    )}
                    {reportBusy ? "Gerando…" : "Gerar CSV"}
                  </DSButton>
                </DSCardContent>
              </DSCard>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}
