import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, RefreshCw, Search, ShieldOff, Trash2, Users } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { setAdminPassengerStatus } from "@/lib/adminControlPlane";
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

type PassengerRow = {
  id: string;
  auth_user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  avatar_url: string | null;
  average_rating: number | null;
  total_ratings: number;
  completed_rides: number;
  blocked_at: string | null;
  block_reason: string | null;
  suspended_at: string | null;
  suspended_until: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type Filter = "todos" | "ativos" | "suspensos" | "bloqueados" | "excluidos";
type Action = "suspend" | "unsuspend" | "block" | "unblock" | "soft_delete";

type ReasonAction = {
  row: PassengerRow;
  action: "suspend" | "block" | "soft_delete";
};

export const Route = createFileRoute("/admin/passageiros")({
  head: () => ({ meta: [{ title: "Passageiros — Admin APOIS" }] }),
  component: AdminPassageirosPage,
});

function cleanText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text || fallback;
}

function safeCount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function safeRating(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(5, Math.max(0, parsed)) : null;
}

function safeDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function statusFor(row: PassengerRow): {
  label: string;
  variant: "success" | "warning" | "danger" | "muted";
} {
  if (row.deleted_at) return { label: "Exclusão operacional", variant: "muted" };
  if (row.blocked_at) return { label: "Bloqueado", variant: "danger" };
  if (row.suspended_at) return { label: "Suspenso", variant: "warning" };
  return { label: "Ativo", variant: "success" };
}

function AdminPassageirosPage() {
  const [rows, setRows] = useState<PassengerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("todos");
  const [reasonFor, setReasonFor] = useState<ReasonAction | null>(null);
  const [reason, setReason] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const requestRef = useRef(0);

  async function load() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const { data: roleRows, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "passenger");
      if (requestId !== requestRef.current) return;
      if (rolesError) throw rolesError;

      const passengerIds = [
        ...new Set((roleRows ?? []).map((role) => cleanText(role.user_id)).filter(Boolean)),
      ];
      if (passengerIds.length === 0) {
        setRows([]);
        setReasonFor(null);
        return;
      }

      const { data, error } = await supabase
        .from("users")
        .select(
          "id,auth_user_id,name,email,phone,city,avatar_url,average_rating,total_ratings,completed_rides,blocked_at,block_reason,suspended_at,suspended_until,deleted_at,created_at,updated_at",
        )
        .in("id", passengerIds)
        .order("created_at", { ascending: false });
      if (requestId !== requestRef.current) return;
      if (error) throw error;

      const normalizedRows = ((data ?? []) as PassengerRow[])
        .filter((row) => Boolean(cleanText(row.id)))
        .map((row) => ({
          ...row,
          id: cleanText(row.id),
          auth_user_id: cleanText(row.auth_user_id),
          name: cleanText(row.name) || null,
          email: cleanText(row.email) || null,
          phone: cleanText(row.phone) || null,
          city: cleanText(row.city) || null,
          avatar_url: cleanText(row.avatar_url) || null,
          average_rating: safeRating(row.average_rating),
          total_ratings: safeCount(row.total_ratings),
          completed_rides: safeCount(row.completed_rides),
          blocked_at: safeDate(row.blocked_at),
          block_reason: cleanText(row.block_reason) || null,
          suspended_at: safeDate(row.suspended_at),
          suspended_until: safeDate(row.suspended_until),
          deleted_at: safeDate(row.deleted_at),
          created_at: safeDate(row.created_at) ?? "",
          updated_at: safeDate(row.updated_at) ?? "",
        }));
      setRows(normalizedRows);
      setReasonFor((current) => {
        if (!current) return null;
        const updated = normalizedRows.find((row) => row.id === current.row.id);
        return updated ? { ...current, row: updated } : null;
      });
    } catch (error) {
      if (requestId !== requestRef.current) return;
      setRows([]);
      setReasonFor(null);
      setLoadError("Não foi possível carregar os passageiros agora. Tente novamente.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao carregar passageiros", error);
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
      .channel("admin-canonical-passengers")
      .on("postgres_changes", { event: "*", schema: "public", table: "users" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, scheduleRefresh)
      .subscribe();
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      requestRef.current += 1;
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    return rows.filter((row) => {
      if (filter === "ativos" && (row.blocked_at || row.suspended_at || row.deleted_at)) return false;
      if (filter === "suspensos" && (!row.suspended_at || row.deleted_at)) return false;
      if (filter === "bloqueados" && (!row.blocked_at || row.deleted_at)) return false;
      if (filter === "excluidos" && !row.deleted_at) return false;
      if (!needle) return true;
      return [row.name, row.email, row.phone, row.city]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(needle));
    });
  }, [filter, query, rows]);

  async function mutate(row: PassengerRow, action: Action, reasonValue?: string | null) {
    if (busyId || !cleanText(row.id)) return;
    const normalizedReason = cleanText(reasonValue).slice(0, 500) || null;
    setBusyId(row.id);
    setActionError(null);
    try {
      await setAdminPassengerStatus(row.id, action, normalizedReason);
      toast.success(
        action === "suspend"
          ? "Passageiro suspenso."
          : action === "unsuspend"
            ? "Suspensão removida."
            : action === "block"
              ? "Passageiro bloqueado."
              : action === "unblock"
                ? "Bloqueio removido."
                : "Exclusão operacional registrada.",
      );
      setReasonFor(null);
      setReason("");
      await load();
    } catch (error) {
      setActionError("Não foi possível concluir a alteração. Tente novamente.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao alterar passageiro", error);
    } finally {
      setBusyId(null);
    }
  }

  async function confirmReasonAction() {
    if (!reasonFor || busyId) return;
    const normalizedReason = cleanText(reason);
    if (normalizedReason.length < 3) {
      setActionError("Informe um motivo com pelo menos 3 caracteres.");
      return;
    }
    if (reasonFor.action === "soft_delete") {
      const confirmed = window.confirm(
        `Confirmar exclusão operacional de ${reasonFor.row.name || "este passageiro"}?`,
      );
      if (!confirmed) return;
    }
    await mutate(reasonFor.row, reasonFor.action, normalizedReason);
  }

  const counts = useMemo(
    () => ({
      active: rows.filter((row) => !row.blocked_at && !row.suspended_at && !row.deleted_at).length,
      suspended: rows.filter((row) => Boolean(row.suspended_at) && !row.deleted_at).length,
      blocked: rows.filter((row) => Boolean(row.blocked_at) && !row.deleted_at).length,
    }),
    [rows],
  );

  return (
    <AdminLayout
      title="Passageiros"
      description="Moderação apoiada na identidade canônica public.users + user_roles"
      actions={
        <DSButton
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading || Boolean(busyId)}
          className="min-h-11 gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-busy={loading}
        >
          <RefreshCw
            className={`h-4 w-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`}
            aria-hidden="true"
          />
          {loading ? "Atualizando…" : "Atualizar"}
        </DSButton>
      }
    >
      <DSCard className="mb-4 border-primary/20 bg-primary/5">
        <DSCardContent className="p-4 text-sm leading-6 text-muted-foreground">
          Bloqueio, suspensão e exclusão operacional são executados por RPC administrativa auditada.
          A ação "excluir" nesta tela é <strong>soft delete operacional</strong>; ela não afirma
          remover automaticamente o registro de <code>auth.users</code>.
        </DSCardContent>
      </DSCard>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Metric label="Ativos" value={counts.active} />
        <Metric label="Suspensos" value={counts.suspended} />
        <Metric label="Bloqueados" value={counts.blocked} />
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="relative min-w-0">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <DSInput
            className="min-h-11 pl-9 text-base"
            placeholder="Buscar por nome, e-mail, telefone ou cidade"
            value={query}
            maxLength={120}
            aria-label="Buscar passageiro"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value as Filter)}
          className="min-h-11 rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Filtrar passageiros por situação"
        >
          <option value="todos">Todos</option>
          <option value="ativos">Ativos</option>
          <option value="suspensos">Suspensos</option>
          <option value="bloqueados">Bloqueados</option>
          <option value="excluidos">Exclusão operacional</option>
        </select>
      </div>

      {loading ? (
        <div role="status" aria-live="polite"><Loading label="Carregando passageiros..." /></div>
      ) : loadError ? (
        <DSCard className="border-destructive/30 bg-destructive/5">
          <DSCardContent className="space-y-3 p-4" role="alert">
            <p className="text-sm font-medium text-destructive">{loadError}</p>
            <DSButton variant="outline" className="min-h-11" onClick={() => void load()}>
              Tentar novamente
            </DSButton>
          </DSCardContent>
        </DSCard>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum passageiro encontrado"
          description={query.trim() || filter !== "todos" ? "Ajuste os filtros ou a busca." : "Aguarde novos cadastros."}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => {
            const status = statusFor(row);
            return (
              <DSCard key={row.id}>
                <DSCardContent className="space-y-3 p-4">
                  <div className="flex min-w-0 flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold">{row.name || "Passageiro sem nome"}</p>
                      <p className="break-all text-sm text-muted-foreground">
                        {row.email || row.phone || "Sem contato"}
                      </p>
                      <p className="break-words text-sm text-muted-foreground">
                        {row.city || "Cidade não informada"}
                      </p>
                    </div>
                    <DSBadge variant={status.variant}>{status.label}</DSBadge>
                  </div>

                  <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                    <span>
                      Avaliação: {row.average_rating == null ? "—" : row.average_rating.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} ({row.total_ratings})
                    </span>
                    <span aria-hidden="true">•</span>
                    <span>Corridas concluídas: {row.completed_rides}</span>
                    {row.block_reason && (
                      <>
                        <span aria-hidden="true">•</span>
                        <span className="break-words text-destructive">Motivo: {row.block_reason}</span>
                      </>
                    )}
                  </div>

                  {!row.deleted_at && (
                    <div className="flex flex-wrap gap-2">
                      {row.suspended_at ? (
                        <DSButton
                          variant="outline"
                          size="sm"
                          onClick={() => void mutate(row, "unsuspend")}
                          disabled={Boolean(busyId)}
                          className="min-h-11 gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <ShieldOff className="h-4 w-4" aria-hidden="true" /> Remover suspensão
                        </DSButton>
                      ) : (
                        <DSButton
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setReasonFor({ row, action: "suspend" });
                            setReason("");
                            setActionError(null);
                          }}
                          disabled={Boolean(busyId)}
                          className="min-h-11 gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <ShieldOff className="h-4 w-4" aria-hidden="true" /> Suspender
                        </DSButton>
                      )}
                      {row.blocked_at ? (
                        <DSButton
                          variant="outline"
                          size="sm"
                          onClick={() => void mutate(row, "unblock")}
                          disabled={Boolean(busyId)}
                          className="min-h-11 gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <Ban className="h-4 w-4" aria-hidden="true" /> Desbloquear
                        </DSButton>
                      ) : (
                        <DSButton
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setReasonFor({ row, action: "block" });
                            setReason("");
                            setActionError(null);
                          }}
                          disabled={Boolean(busyId)}
                          className="min-h-11 gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <Ban className="h-4 w-4" aria-hidden="true" /> Bloquear
                        </DSButton>
                      )}
                      <DSButton
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setReasonFor({ row, action: "soft_delete" });
                          setReason("");
                          setActionError(null);
                        }}
                        disabled={Boolean(busyId)}
                        className="min-h-11 gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" /> Exclusão operacional
                      </DSButton>
                    </div>
                  )}
                  {busyId === row.id ? (
                    <p className="text-sm text-muted-foreground" role="status" aria-live="polite">Aplicando alteração…</p>
                  ) : null}
                </DSCardContent>
              </DSCard>
            );
          })}
        </div>
      )}

      {reasonFor && (
        <DSCard className="mt-6 border-warning/30" role="region" aria-labelledby="passenger-action-title">
          <DSCardContent className="space-y-3 p-4">
            <p id="passenger-action-title" className="break-words font-semibold">
              {reasonFor.action === "suspend"
                ? "Suspender"
                : reasonFor.action === "block"
                  ? "Bloquear"
                  : "Excluir operacionalmente"}{" "}
              — {reasonFor.row.name || reasonFor.row.id.slice(0, 8)}
            </p>
            <p className="text-sm leading-6 text-muted-foreground">
              Informe o motivo. Ele será persistido pelo fluxo administrativo do servidor.
            </p>
            <label className="block space-y-1 text-sm font-medium" htmlFor="passenger-action-reason">
              Motivo
              <DSTextarea
                id="passenger-action-reason"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setActionError(null);
                }}
                maxLength={500}
                className="min-h-28 text-base"
                placeholder="Motivo obrigatório"
                aria-describedby="passenger-action-help"
              />
            </label>
            <p id="passenger-action-help" className="text-sm text-muted-foreground">
              {reason.length}/500 caracteres
            </p>
            {actionError ? <p className="text-sm text-destructive" role="alert">{actionError}</p> : null}
            <div className="flex flex-wrap gap-2">
              <DSButton
                variant="outline"
                className="min-h-11"
                disabled={Boolean(busyId)}
                onClick={() => {
                  setReasonFor(null);
                  setReason("");
                  setActionError(null);
                }}
              >
                Cancelar
              </DSButton>
              <DSButton
                className="min-h-11"
                onClick={() => void confirmReasonAction()}
                disabled={cleanText(reason).length < 3 || Boolean(busyId)}
                aria-busy={busyId === reasonFor.row.id}
              >
                {busyId === reasonFor.row.id ? "Confirmando…" : "Confirmar"}
              </DSButton>
            </div>
          </DSCardContent>
        </DSCard>
      )}
    </AdminLayout>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <DSCard>
      <DSCardContent className="min-w-0 p-4">
        <p className="break-words text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-bold tabular-nums">{safeCount(value)}</p>
      </DSCardContent>
    </DSCard>
  );
}
