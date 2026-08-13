/* eslint-disable @typescript-eslint/no-explicit-any -- Temporary Phase 8 bridge until generated Supabase types include canonical admin RPCs. */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, Loader2, Search, ScrollText } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/formatters";
import { downloadCsv } from "@/lib/csvExport";
import { DSBadge, DSButton, DSCard, DSCardContent, DSInput, EmptyState } from "@/design-system";

export const Route = createFileRoute("/admin/logs")({
  head: () => ({ meta: [{ title: "Auditoria — Admin APOIS" }] }),
  component: AdminLogsPage,
});

type Audit = {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

function AdminLogsPage() {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  async function refresh() {
    setLoading(true);
    let query = (supabase as any)
      .from("audit_logs")
      .select("id,actor_id,action,entity_type,entity_id,metadata,created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    if (q.trim()) {
      const term = `%${q.trim()}%`;
      query = query.or(`action.ilike.${term},entity_type.ilike.${term},entity_id.ilike.${term}`);
    }
    const { data, error } = await query;
    if (error) {
      setAudits([]);
    } else {
      setAudits((data ?? []) as Audit[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel("admin-audit-canonical")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_logs" },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <AdminLayout
      title="Logs e Auditoria"
      description={`${audits.length} eventos canônicos carregados`}
      actions={
        <DSButton
          size="sm"
          variant="outline"
          className="gap-1"
          onClick={() =>
            downloadCsv(
              `apois-audit-${new Date().toISOString().slice(0, 10)}`,
              audits.map((audit) => ({
                id: audit.id,
                ator: audit.actor_id ?? "",
                acao: audit.action,
                entidade: audit.entity_type,
                entidade_id: audit.entity_id ?? "",
                metadata: JSON.stringify(audit.metadata ?? {}),
                data: audit.created_at,
              })),
            )
          }
        >
          <Download className="h-4 w-4" /> CSV
        </DSButton>
      }
    >
      <div className="mb-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
        A fonte de verdade é <strong>public.audit_logs</strong>. Eventos críticos são gravados pelo
        backend/RPC no mesmo fluxo da ação administrativa; não existem logs fictícios de navegador.
      </div>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <DSInput
          className="pl-9"
          placeholder="Buscar ação, tipo de entidade ou id"
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
      </div>

      {loading ? (
        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
      ) : audits.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="Sem eventos de auditoria"
          description="Ações administrativas e eventos de segurança aparecerão aqui quando forem registrados pelo backend."
        />
      ) : (
        <div className="space-y-2">
          {audits.map((audit) => (
            <DSCard key={audit.id} className="border-border bg-card/60">
              <DSCardContent className="space-y-2 p-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <DSBadge className="font-mono">{audit.action}</DSBadge>
                  <span className="text-muted-foreground">{audit.entity_type}</span>
                  {audit.entity_id && (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {audit.entity_id}
                    </span>
                  )}
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {formatDate(audit.created_at)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                  <span>ator: {audit.actor_id ?? "sistema"}</span>
                  {Object.keys(audit.metadata ?? {}).length > 0 && (
                    <span className="break-all font-mono">{JSON.stringify(audit.metadata)}</span>
                  )}
                </div>
              </DSCardContent>
            </DSCard>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
