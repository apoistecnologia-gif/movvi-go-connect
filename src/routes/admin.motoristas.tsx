import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Eye,
  FileText,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { getDriverDocumentUrls } from "@/lib/driverDocs.functions";
import { setAdminDriverApproval, setAdminDriverSuspension } from "@/lib/adminControlPlane";
import {
  DSBadge,
  DSButton,
  DSCard,
  DSCardContent,
  DSInput,
  DSTextarea,
  EmptyState,
  Loading,
} from "@/design-system";
import { toast } from "sonner";

type DriverRow = {
  id: string;
  user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  category: string | null;
  city: string | null;
  state: string | null;
  approval_status: string;
  documents_status: string | null;
  subscription_status: string;
  is_online: boolean;
  rating: number | null;
  total_ratings: number;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  vehicle_color: string | null;
  selfie_url: string | null;
  cnh_url: string | null;
  vehicle_document_url: string | null;
  motivo_reprovacao: string | null;
  suspended_at: string | null;
  updated_at: string;
};

type Docs = {
  selfie_url: string | null;
  cnh_url: string | null;
  vehicle_document_url: string | null;
};

type ApprovalStatus = "em_analise" | "aprovado" | "reprovado" | "bloqueado";
type Filter = "todos" | ApprovalStatus | "online" | "suspenso";

export const Route = createFileRoute("/admin/motoristas")({
  head: () => ({ meta: [{ title: "Motoristas — Admin APOIS" }] }),
  component: AdminMotoristasPage,
});

function cleanText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text || fallback;
}

function normalizeApproval(value: unknown): ApprovalStatus {
  const normalized = cleanText(value).toLowerCase();
  if (["aprovado", "approved", "ativo", "active"].includes(normalized)) return "aprovado";
  if (["reprovado", "rejected"].includes(normalized)) return "reprovado";
  if (["bloqueado", "blocked"].includes(normalized)) return "bloqueado";
  return "em_analise";
}

function approvalLabel(status: ApprovalStatus) {
  if (status === "aprovado") return "Aprovado";
  if (status === "reprovado") return "Reprovado";
  if (status === "bloqueado") return "Bloqueado";
  return "Em análise";
}

function statusVariant(status: ApprovalStatus): "success" | "warning" | "danger" | "muted" {
  if (status === "aprovado") return "success";
  if (status === "em_analise") return "warning";
  if (status === "reprovado" || status === "bloqueado") return "danger";
  return "muted";
}

function safeRating(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(5, Math.max(0, parsed)) : null;
}

function safeCount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function safeDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function safeDocumentUrl(value: unknown) {
  const raw = cleanText(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function AdminMotoristasPage() {
  const getDocs = useServerFn(getDriverDocumentUrls);
  const [rows, setRows] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("todos");
  const [selected, setSelected] = useState<DriverRow | null>(null);
  const [docs, setDocs] = useState<Docs | null>(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const requestRef = useRef(0);
  const docsRequestRef = useRef(0);

  async function load() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("drivers")
        .select(
          "id,user_id,name,email,phone,category,city,state,approval_status,documents_status,subscription_status,is_online,rating,total_ratings,vehicle_model,vehicle_plate,vehicle_color,selfie_url,cnh_url,vehicle_document_url,motivo_reprovacao,suspended_at,updated_at",
        )
        .order("updated_at", { ascending: false });
      if (requestId !== requestRef.current) return;
      if (error) throw error;

      const normalizedRows = ((data ?? []) as DriverRow[])
        .filter((row) => Boolean(cleanText(row.id)))
        .map((row) => ({
          ...row,
          id: cleanText(row.id),
          user_id: cleanText(row.user_id),
          name: cleanText(row.name) || null,
          email: cleanText(row.email) || null,
          phone: cleanText(row.phone) || null,
          category: cleanText(row.category) || null,
          city: cleanText(row.city) || null,
          state: cleanText(row.state) || null,
          approval_status: normalizeApproval(row.approval_status),
          documents_status: cleanText(row.documents_status) || null,
          subscription_status: cleanText(row.subscription_status, "não informado").toLowerCase(),
          is_online: row.is_online === true,
          rating: safeRating(row.rating),
          total_ratings: safeCount(row.total_ratings),
          vehicle_model: cleanText(row.vehicle_model) || null,
          vehicle_plate: cleanText(row.vehicle_plate).toUpperCase().replace(/\s+/g, "") || null,
          vehicle_color: cleanText(row.vehicle_color) || null,
          selfie_url: cleanText(row.selfie_url) || null,
          cnh_url: cleanText(row.cnh_url) || null,
          vehicle_document_url: cleanText(row.vehicle_document_url) || null,
          motivo_reprovacao: cleanText(row.motivo_reprovacao) || null,
          suspended_at: safeDate(row.suspended_at),
          updated_at: safeDate(row.updated_at) ?? "",
        }));
      setRows(normalizedRows);
      setSelected((current) =>
        current ? normalizedRows.find((row) => row.id === current.id) ?? null : null,
      );
    } catch (error) {
      if (requestId !== requestRef.current) return;
      setRows([]);
      setSelected(null);
      setDocs(null);
      setLoadError("Não foi possível carregar os motoristas agora. Tente novamente.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao carregar motoristas", error);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    let refreshTimer: number | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void load(), 250);
    };
    const channel = supabase
      .channel("admin-canonical-drivers")
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, scheduleRefresh)
      .subscribe();
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      requestRef.current += 1;
      docsRequestRef.current += 1;
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    return rows.filter((row) => {
      const approval = normalizeApproval(row.approval_status);
      if (filter === "online" && !row.is_online) return false;
      if (filter === "suspenso" && !row.suspended_at) return false;
      if (["em_analise", "aprovado", "reprovado", "bloqueado"].includes(filter) && approval !== filter) return false;
      if (!needle) return true;
      return [row.name, row.email, row.phone, row.city, row.state, row.category, row.vehicle_plate]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(needle));
    });
  }, [filter, query, rows]);

  async function approval(driver: DriverRow, status: ApprovalStatus) {
    if (busyId || !cleanText(driver.id)) return;
    const reason = status === "reprovado" ? cleanText(rejectReason).slice(0, 500) : null;
    if (status === "reprovado" && (!reason || reason.length < 3)) {
      setActionError("Informe um motivo de reprovação com pelo menos 3 caracteres.");
      return;
    }
    if (status === "bloqueado") {
      const confirmed = window.confirm(`Confirmar bloqueio de ${driver.name || "este motorista"}?`);
      if (!confirmed) return;
    }
    setBusyId(driver.id);
    setActionError(null);
    try {
      await setAdminDriverApproval(driver.id, status, reason);
      toast.success(
        status === "aprovado"
          ? "Motorista aprovado."
          : status === "reprovado"
            ? "Motorista reprovado."
            : status === "bloqueado"
              ? "Motorista bloqueado."
              : "Motorista enviado para análise.",
      );
      setRejectReason("");
      await load();
    } catch (error) {
      setActionError("Não foi possível alterar a aprovação. Tente novamente.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao alterar aprovação", error);
    } finally {
      setBusyId(null);
    }
  }

  async function suspension(driver: DriverRow, suspend: boolean) {
    if (busyId || !cleanText(driver.id)) return;
    if (suspend) {
      const confirmed = window.confirm(`Confirmar suspensão operacional de ${driver.name || "este motorista"}?`);
      if (!confirmed) return;
    }
    setBusyId(driver.id);
    setActionError(null);
    try {
      await setAdminDriverSuspension(
        driver.id,
        suspend,
        suspend ? "Suspensão operacional pelo painel APOIS." : null,
      );
      toast.success(suspend ? "Motorista suspenso." : "Suspensão removida.");
      await load();
    } catch (error) {
      setActionError("Não foi possível alterar a suspensão. Tente novamente.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao alterar suspensão", error);
    } finally {
      setBusyId(null);
    }
  }

  async function openDetails(driver: DriverRow) {
    if (!cleanText(driver.id)) return;
    const requestId = ++docsRequestRef.current;
    setSelected(driver);
    setDocs(null);
    setDocsError(null);
    setRejectReason("");
    setActionError(null);
    setDocsLoading(true);
    try {
      const next = await getDocs({ data: { driverId: driver.id } });
      if (requestId !== docsRequestRef.current) return;
      setDocs({
        selfie_url: safeDocumentUrl(next?.selfie_url),
        cnh_url: safeDocumentUrl(next?.cnh_url),
        vehicle_document_url: safeDocumentUrl(next?.vehicle_document_url),
      });
    } catch (error) {
      if (requestId !== docsRequestRef.current) return;
      setDocs(null);
      setDocsError("Não foi possível gerar o acesso temporário aos documentos. Tente novamente.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao gerar URLs de documentos", error);
    } finally {
      if (requestId === docsRequestRef.current) setDocsLoading(false);
    }
  }

  function closeDetails() {
    docsRequestRef.current += 1;
    setSelected(null);
    setDocs(null);
    setDocsError(null);
    setRejectReason("");
    setActionError(null);
    setDocsLoading(false);
  }

  return (
    <AdminLayout
      title="Motoristas"
      description="KYC, aprovação, bloqueio e suspensão sobre a identidade canônica do motorista"
      actions={
        <DSButton
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading || Boolean(busyId)}
          className="min-h-11 gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-busy={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
          {loading ? "Atualizando…" : "Atualizar"}
        </DSButton>
      }
    >
      <DSCard className="mb-4 border-primary/20 bg-primary/5">
        <DSCardContent className="flex min-w-0 gap-3 p-4 text-sm leading-6 text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <p className="min-w-0 break-words">
            Aprovação e suspensão são executadas por RPCs administrativas com permissão e auditoria
            no servidor. Documentos privados são exibidos somente por URLs assinadas temporárias.
            Aprovar motorista não fabrica pagamento nem assinatura.
          </p>
        </DSCardContent>
      </DSCard>

      <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <DSInput
            className="min-h-11 pl-9 text-base"
            placeholder="Buscar por nome, contato, cidade, categoria ou placa"
            value={query}
            maxLength={140}
            aria-label="Buscar motorista"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value as Filter)}
          className="min-h-11 rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Filtrar motoristas"
        >
          <option value="todos">Todos</option>
          <option value="em_analise">Em análise</option>
          <option value="aprovado">Aprovados</option>
          <option value="reprovado">Reprovados</option>
          <option value="bloqueado">Bloqueados</option>
          <option value="online">Online</option>
          <option value="suspenso">Suspensos</option>
        </select>
      </div>

      {loading ? (
        <div role="status" aria-live="polite"><Loading label="Carregando motoristas..." /></div>
      ) : loadError ? (
        <DSCard className="border-destructive/30 bg-destructive/5">
          <DSCardContent className="space-y-3 p-4" role="alert">
            <p className="text-sm font-medium text-destructive">{loadError}</p>
            <DSButton variant="outline" className="min-h-11" onClick={() => void load()}>Tentar novamente</DSButton>
          </DSCardContent>
        </DSCard>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="Nenhum motorista encontrado"
          description={query.trim() || filter !== "todos" ? "Ajuste os filtros ou a busca." : "Aguarde novos cadastros."}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((driver) => {
            const approvalStatus = normalizeApproval(driver.approval_status);
            return (
              <DSCard key={driver.id}>
                <DSCardContent className="space-y-3 p-4">
                  <div className="flex min-w-0 flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold">{driver.name || "Motorista sem nome"}</p>
                      <p className="break-all text-sm text-muted-foreground">{driver.email || driver.phone || "Sem contato"}</p>
                      <p className="break-words text-sm text-muted-foreground">
                        {[driver.city, driver.state].filter(Boolean).join(" — ") || "Localidade não informada"}
                      </p>
                    </div>
                    <DSBadge variant={statusVariant(approvalStatus)}>{approvalLabel(approvalStatus)}</DSBadge>
                    <DSBadge variant={driver.is_online ? "primary" : "muted"}>{driver.is_online ? "Online" : "Offline"}</DSBadge>
                    {driver.suspended_at && <DSBadge variant="danger">Suspenso</DSBadge>}
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                    <span>Categoria: {driver.category || "Não informada"}</span>
                    <span aria-hidden="true">•</span>
                    <span className="break-words">
                      Veículo: {[driver.vehicle_model, driver.vehicle_color, driver.vehicle_plate].filter(Boolean).join(" · ") || "Não informado"}
                    </span>
                    <span aria-hidden="true">•</span>
                    <span>Assinatura: {driver.subscription_status || "não informada"}</span>
                    <span aria-hidden="true">•</span>
                    <span>
                      Avaliação: {driver.rating == null ? "—" : driver.rating.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} ({driver.total_ratings})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <DSButton variant="outline" size="sm" onClick={() => void openDetails(driver)} disabled={Boolean(busyId)} className="min-h-11 gap-2">
                      <Eye className="h-4 w-4" aria-hidden="true" /> Detalhes
                    </DSButton>
                    <DSButton size="sm" onClick={() => void approval(driver, "aprovado")} disabled={Boolean(busyId) || approvalStatus === "aprovado"} className="min-h-11 gap-2">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Aprovar
                    </DSButton>
                    <DSButton variant="outline" size="sm" onClick={() => void approval(driver, "bloqueado")} disabled={Boolean(busyId) || approvalStatus === "bloqueado"} className="min-h-11 gap-2">
                      <XCircle className="h-4 w-4" aria-hidden="true" /> Bloquear
                    </DSButton>
                    <DSButton variant="outline" size="sm" onClick={() => void suspension(driver, !driver.suspended_at)} disabled={Boolean(busyId)} className="min-h-11 gap-2">
                      {driver.suspended_at ? <PlayCircle className="h-4 w-4" aria-hidden="true" /> : <PauseCircle className="h-4 w-4" aria-hidden="true" />}
                      {driver.suspended_at ? "Remover suspensão" : "Suspender"}
                    </DSButton>
                  </div>
                  {busyId === driver.id ? <p className="text-sm text-muted-foreground" role="status" aria-live="polite">Aplicando alteração…</p> : null}
                </DSCardContent>
              </DSCard>
            );
          })}
        </div>
      )}

      {selected && (
        <DSCard className="mt-6 border-primary/20" role="region" aria-labelledby="driver-review-title">
          <DSCardContent className="space-y-4 p-4">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 id="driver-review-title" className="min-w-0 break-words font-semibold">
                Revisão — {selected.name || selected.id.slice(0, 8)}
              </h2>
              <DSButton variant="ghost" size="sm" className="ml-auto min-h-11" disabled={Boolean(busyId)} onClick={closeDetails}>Fechar</DSButton>
            </div>
            {docsError ? (
              <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3" role="alert">
                <p className="text-sm text-destructive">{docsError}</p>
                <DSButton variant="outline" className="min-h-11" onClick={() => void openDetails(selected)} disabled={docsLoading}>Tentar novamente</DSButton>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-3">
              <DocumentLink label="Selfie" url={docs?.selfie_url ?? null} loading={docsLoading} />
              <DocumentLink label="CNH" url={docs?.cnh_url ?? null} loading={docsLoading} />
              <DocumentLink label="Documento do veículo" url={docs?.vehicle_document_url ?? null} loading={docsLoading} />
            </div>
            {selected.motivo_reprovacao && <p className="break-words text-sm text-destructive">Motivo atual: {selected.motivo_reprovacao}</p>}
            <div className="space-y-2">
              <label htmlFor="driver-reject-reason" className="text-sm font-semibold text-muted-foreground">Motivo da reprovação</label>
              <DSTextarea
                id="driver-reject-reason"
                value={rejectReason}
                onChange={(event) => {
                  setRejectReason(event.target.value);
                  setActionError(null);
                }}
                maxLength={500}
                className="min-h-28 text-base"
                placeholder="Obrigatório para reprovar"
                aria-describedby="driver-reject-help"
              />
              <p id="driver-reject-help" className="text-sm text-muted-foreground">{rejectReason.length}/500 caracteres</p>
              {actionError ? <p className="text-sm text-destructive" role="alert">{actionError}</p> : null}
              <DSButton
                variant="outline"
                onClick={() => void approval(selected, "reprovado")}
                disabled={Boolean(busyId) || cleanText(rejectReason).length < 3}
                className="min-h-11 gap-2"
                aria-busy={busyId === selected.id}
              >
                <XCircle className="h-4 w-4" aria-hidden="true" /> {busyId === selected.id ? "Reprovando…" : "Reprovar cadastro"}
              </DSButton>
            </div>
          </DSCardContent>
        </DSCard>
      )}
    </AdminLayout>
  );
}

function DocumentLink({ label, url, loading }: { label: string; url: string | null; loading: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-border p-3">
      <div className="mb-2 flex min-w-0 items-center gap-2">
        <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 break-words text-sm font-medium">{label}</span>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">Gerando acesso temporário…</p>
      ) : url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center break-words text-sm font-semibold text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Abrir documento
        </a>
      ) : (
        <p className="text-sm text-muted-foreground">Não enviado</p>
      )}
    </div>
  );
}
