/* eslint-disable @typescript-eslint/no-explicit-any -- Temporary Phase 8 bridge until generated Supabase types include canonical admin RPCs. */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, RefreshCw, Search, ScrollText } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/formatters";
import { downloadCsv } from "@/lib/csvExport";
import { DSBadge, DSButton, DSCard, DSCardContent, DSInput, EmptyState } from "@/design-system";
import { toast } from "sonner";

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

function cleanText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text || fallback;
}

function safeDate(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeAudit(value: unknown): Audit | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<Audit>;
  const id = Number(row.id);
  const action = cleanText(row.action, "ação não informada");
  const entityType = cleanText(row.entity_type, "entidade não informada");
  const created = safeDate(row.created_at);
  if (!Number.isFinite(id) || id < 0 || !created) return null;
  return {
    id,
    actor_id: cleanText(row.actor_id) || null,
    action,
    entity_type: entityType,
    entity_id: cleanText(row.entity_id) || null,
    metadata: safeMetadata(row.metadata),
    created_at: created.toISOString(),
  };
}

function safeJson(value: unknown, max = 4000) {
  try {
    const text = JSON.stringify(value ?? {});
    return text.length > max ? `${text.slice(0, max)}…` : text;
  } catch {
    return "{}";
  }
}

function sanitizeSearch(value: string) {
  return value.trim().replace(/[(),]/g, " ").replace(/\s+/g, " ").slice(0, 100);
}

function AdminLogsPage() {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const refreshTimerRef = useRef<number | null>(null);

  async function refresh(searchValue = q) {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      let query = (supabase as any)
        .from("audit_logs")
        .select("id,actor_id,action,entity_type,entity_id,metadata,created_at")
        .order("created_at", { ascending: false })
        .limit(300);
      const search = sanitizeSearch(searchValue);
      if (search) {
        const term = `%${search}%`;
        query = query.or(`action.ilike.${term},entity_type.ilike.${term},entity_id.ilike.${term}`);
      }
      const { data, error } = await query;
      if (requestId !== requestRef.current) return;
      if (error) throw error;
      setAudits((data ?? []).map(normalizeAudit).filter((row: Audit | null): row is Audit => Boolean(row)));
    } catch (error) {
      if (requestId !== requestRef.current) return;
      setAudits([]);
      setLoadError("Não foi possível carregar a auditoria agora. Tente novamente.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao carregar auditoria", error);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(q), 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    const scheduleRefresh = () => {
      if (refreshTimerRef.current != null) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => void refresh(q), 300);
    };
    const channel = supabase
      .channel("admin-audit-canonical")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_logs" },
        scheduleRefresh,
      )
      .subscribe();
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      requestRef.current += 1;
      if (refreshTimerRef.current != null) window.clearTimeout(refreshTimerRef.current);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canExport = !loading && !loadError && audits.length > 0;
  const countLabel = useMemo(
    () => `${audits.length} ${audits.length === 1 ? "evento canônico carregado" : "eventos canônicos carregados"}`,
    [audits.length],
  );

  function exportCsv() {
    if (!canExport) return;
    try {
      downloadCsv(
        `apois-audit-${new Date().toISOString().slice(0, 10)}`,
        audits.map((audit) => ({
          id: audit.id,
          ator: audit.actor_id ?? "",
          acao: audit.action,
          entidade: audit.entity_type,
          entidade_id: audit.entity_id ?? "",
          metadata: safeJson(audit.metadata, 10000),
          data: audit.created_at,
        })),
      );
      toast.success("Arquivo de auditoria preparado para download.");
    } catch (error) {
      toast.error("Não foi possível gerar o CSV de auditoria.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao exportar auditoria", error);
    }
  }

  return (
    <AdminLayout
      title="Logs e Auditoria"
      description={countLabel}
      actions={
        <DSButton
          size="sm"
          variant="outline"
          className="min-h-11 gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          onClick={exportCsv}
          disabled={!canExport}
          aria-label="Exportar eventos de auditoria em CSV"
        >
          <Download className="h-4 w-4" aria-hidden="true" /> CSV
        </DSButton>
      }
    >
      <div className="mb-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
        A fonte de verdade é <strong>public.audit_logs</strong>. Eventos críticos são gravados pelo
        backend/RPC no mesmo fluxo da ação administrativa; não existem logs fictícios de navegador.
      </div>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <DSInput
          className="min-h-11 pl-9 text-base"
          placeholder="Buscar ação, tipo de entidade ou ID"
          value={q}
          maxLength={100}
          aria-label="Buscar na auditoria"
          onChange={(event) => setQ(event.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
          <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Carregando auditoria…
        </div>
      ) : loadError ? (
        <DSCard className="border-destructive/30 bg-destructive/5">
          <DSCardContent className="space-y-3 p-4" role="alert">
            <p className="text-sm font-medium text-destructive">{loadError}</p>
            <DSButton variant="outline" className="min-h-11 gap-2" onClick={() => void refresh(q)}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Tentar novamente
            </DSButton>
          </DSCardContent>
        </DSCard>
      ) : audits.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={q.trim() ? "Nenhum evento encontrado" : "Sem eventos de auditoria"}
          description={q.trim() ? "Revise os termos pesquisados." : "Ações administrativas e eventos de segurança aparecerão aqui quando forem registrados pelo backend."}
        />
      ) : (
        <div className="space-y-2" aria-live="polite">
          {audits.map((audit) => (
            <DSCard key={audit.id} className="border-border bg-card/60">
              <DSCardContent className="min-w-0 space-y-2 p-3 text-sm">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <DSBadge className="max-w-full break-all font-mono">{audit.action}</DSBadge>
                  <span className="break-words text-muted-foreground">{audit.entity_type}</span>
                  {audit.entity_id ? (
                    <span className="max-w-full break-all font-mono text-xs text-muted-foreground">
                      {audit.entity_id}
                    </span>
                  ) : null}
                  <time className="ml-auto shrink-0 text-xs text-muted-foreground" dateTime={audit.created_at}>
                    {formatDate(audit.created_at)}
                  </time>
                </div>
                <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs leading-5 text-muted-foreground">
                  <span className="max-w-full break-all">Ator: {audit.actor_id ?? "sistema"}</span>
                  {Object.keys(audit.metadata).length > 0 ? (
                    <span className="max-w-full break-all font-mono">{safeJson(audit.metadata)}</span>
                  ) : null}
                </div>
              </DSCardContent>
            </DSCard>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
