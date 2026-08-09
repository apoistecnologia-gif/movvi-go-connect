import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
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

type Filter =
  | "todos"
  | "em_analise"
  | "aprovado"
  | "reprovado"
  | "bloqueado"
  | "online"
  | "suspenso";

export const Route = createFileRoute("/admin/motoristas")({
  head: () => ({ meta: [{ title: "Motoristas — Admin APOIS" }] }),
  component: AdminMotoristasPage,
});

function statusVariant(status: string): "success" | "warning" | "danger" | "muted" {
  if (status === "aprovado") return "success";
  if (status === "em_analise" || status === "pendente") return "warning";
  if (status === "reprovado" || status === "bloqueado") return "danger";
  return "muted";
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
  const [rejectReason, setRejectReason] = useState("");

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("drivers")
        .select(
          "id,user_id,name,email,phone,category,city,state,approval_status,documents_status,subscription_status,is_online,rating,total_ratings,vehicle_model,vehicle_plate,vehicle_color,selfie_url,cnh_url,vehicle_document_url,motivo_reprovacao,suspended_at,updated_at",
        )
        .order("updated_at", { ascending: false });
      if (error) throw error;
      setRows((data ?? []) as DriverRow[]);
      setSelected((current) =>
        current
          ? (((data ?? []).find((row) => row.id === current.id) as DriverRow | undefined) ?? null)
          : null,
      );
    } catch (error) {
      setRows([]);
      toast.error(
        error instanceof Error ? error.message : "Não foi possível carregar os motoristas.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const channel = supabase
      .channel("admin-canonical-drivers")
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === "online" && !row.is_online) return false;
      if (filter === "suspenso" && !row.suspended_at) return false;
      if (
        ["em_analise", "aprovado", "reprovado", "bloqueado"].includes(filter) &&
        row.approval_status !== filter
      )
        return false;
      if (!needle) return true;
      return [row.name, row.email, row.phone, row.city, row.state, row.category, row.vehicle_plate]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [filter, query, rows]);

  async function approval(
    driver: DriverRow,
    status: "em_analise" | "aprovado" | "reprovado" | "bloqueado",
  ) {
    const reason = status === "reprovado" ? rejectReason.trim() : null;
    if (status === "reprovado" && !reason) return toast.error("Informe o motivo da reprovação.");
    setBusyId(driver.id);
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
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar a aprovação.");
    } finally {
      setBusyId(null);
    }
  }

  async function suspension(driver: DriverRow, suspend: boolean) {
    setBusyId(driver.id);
    try {
      await setAdminDriverSuspension(
        driver.id,
        suspend,
        suspend ? "Suspensão operacional pelo painel APOIS." : null,
      );
      toast.success(suspend ? "Motorista suspenso." : "Suspensão removida.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar a suspensão.");
    } finally {
      setBusyId(null);
    }
  }

  async function openDetails(driver: DriverRow) {
    setSelected(driver);
    setDocs(null);
    setDocsLoading(true);
    try {
      setDocs(await getDocs({ data: { driverId: driver.id } }));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível gerar URLs temporárias dos documentos.",
      );
    } finally {
      setDocsLoading(false);
    }
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
          disabled={loading}
          className="gap-1"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </DSButton>
      }
    >
      <DSCard className="mb-4 border-primary/20 bg-primary/5">
        <DSCardContent className="flex gap-3 p-4 text-sm text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p>
            Aprovação e suspensão são executadas por RPCs administrativas com permissão e auditoria
            no servidor. Documentos privados são exibidos somente por URLs assinadas temporárias.
            Aprovar motorista não fabrica pagamento nem assinatura.
          </p>
        </DSCardContent>
      </DSCard>

      <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <DSInput
            className="pl-9"
            placeholder="Buscar por nome, contato, cidade, categoria ou placa"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value as Filter)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
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
        <Loading label="Carregando motoristas..." />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="Nenhum motorista encontrado"
          description="Ajuste os filtros ou aguarde novos cadastros."
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((driver) => (
            <DSCard key={driver.id}>
              <DSCardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{driver.name || "Motorista sem nome"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {driver.email || driver.phone || "Sem contato"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[driver.city, driver.state].filter(Boolean).join(" — ") ||
                        "Localidade não informada"}
                    </p>
                  </div>
                  <DSBadge variant={statusVariant(driver.approval_status)}>
                    {driver.approval_status}
                  </DSBadge>
                  <DSBadge variant={driver.is_online ? "primary" : "muted"}>
                    {driver.is_online ? "Online" : "Offline"}
                  </DSBadge>
                  {driver.suspended_at && <DSBadge variant="danger">Suspenso</DSBadge>}
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>Categoria: {driver.category || "—"}</span>
                  <span>•</span>
                  <span>
                    Veículo:{" "}
                    {[driver.vehicle_model, driver.vehicle_color, driver.vehicle_plate]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </span>
                  <span>•</span>
                  <span>Assinatura: {driver.subscription_status}</span>
                  <span>•</span>
                  <span>
                    Avaliação: {driver.rating == null ? "—" : Number(driver.rating).toFixed(2)} (
                    {driver.total_ratings})
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <DSButton
                    variant="outline"
                    size="sm"
                    onClick={() => void openDetails(driver)}
                    className="gap-1"
                  >
                    <Eye className="h-4 w-4" /> Detalhes
                  </DSButton>
                  <DSButton
                    size="sm"
                    onClick={() => void approval(driver, "aprovado")}
                    disabled={busyId === driver.id || driver.approval_status === "aprovado"}
                    className="gap-1"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Aprovar
                  </DSButton>
                  <DSButton
                    variant="outline"
                    size="sm"
                    onClick={() => void approval(driver, "bloqueado")}
                    disabled={busyId === driver.id}
                    className="gap-1"
                  >
                    <XCircle className="h-4 w-4" /> Bloquear
                  </DSButton>
                  <DSButton
                    variant="outline"
                    size="sm"
                    onClick={() => void suspension(driver, !driver.suspended_at)}
                    disabled={busyId === driver.id}
                    className="gap-1"
                  >
                    {driver.suspended_at ? (
                      <PlayCircle className="h-4 w-4" />
                    ) : (
                      <PauseCircle className="h-4 w-4" />
                    )}{" "}
                    {driver.suspended_at ? "Remover suspensão" : "Suspender"}
                  </DSButton>
                </div>
              </DSCardContent>
            </DSCard>
          ))}
        </div>
      )}

      {selected && (
        <DSCard className="mt-6 border-primary/20">
          <DSCardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">
                Revisão — {selected.name || selected.id.slice(0, 8)}
              </h2>
              <DSButton
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  setSelected(null);
                  setDocs(null);
                }}
              >
                Fechar
              </DSButton>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <DocumentLink label="Selfie" url={docs?.selfie_url ?? null} loading={docsLoading} />
              <DocumentLink label="CNH" url={docs?.cnh_url ?? null} loading={docsLoading} />
              <DocumentLink
                label="Documento do veículo"
                url={docs?.vehicle_document_url ?? null}
                loading={docsLoading}
              />
            </div>
            {selected.motivo_reprovacao && (
              <p className="text-sm text-destructive">Motivo atual: {selected.motivo_reprovacao}</p>
            )}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Motivo da reprovação
              </label>
              <DSTextarea
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                maxLength={500}
                placeholder="Obrigatório para reprovar"
              />
              <DSButton
                variant="outline"
                onClick={() => void approval(selected, "reprovado")}
                disabled={busyId === selected.id || !rejectReason.trim()}
                className="gap-1"
              >
                <XCircle className="h-4 w-4" /> Reprovar cadastro
              </DSButton>
            </div>
          </DSCardContent>
        </DSCard>
      )}
    </AdminLayout>
  );
}

function DocumentLink({
  label,
  url,
  loading,
}: {
  label: string;
  url: string | null;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="mb-2 flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground">Gerando acesso temporário...</p>
      ) : url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-semibold text-primary underline"
        >
          Abrir documento
        </a>
      ) : (
        <p className="text-xs text-muted-foreground">Não enviado</p>
      )}
    </div>
  );
}
