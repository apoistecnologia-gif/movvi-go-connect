import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Ban, RefreshCw, Search, ShieldOff, Trash2, Users } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { setAdminPassengerStatus } from "@/lib/adminControlPlane";
import { DSBadge, DSButton, DSCard, DSCardContent, DSInput, DSTextarea, EmptyState, Loading } from "@/design-system";
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

export const Route = createFileRoute("/admin/passageiros")({
  head: () => ({ meta: [{ title: "Passageiros — Admin APOIS" }] }),
  component: AdminPassageirosPage,
});

function statusFor(row: PassengerRow): { label: string; variant: "success" | "warning" | "danger" | "muted" } {
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
  const [reasonFor, setReasonFor] = useState<{ row: PassengerRow; action: "suspend" | "block" | "soft_delete" } | null>(null);
  const [reason, setReason] = useState("");

  async function load() {
    setLoading(true);
    try {
      const { data: roleRows, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "passenger");
      if (rolesError) throw rolesError;

      const passengerIds = [...new Set((roleRows ?? []).map((role) => role.user_id))];
      if (passengerIds.length === 0) {
        setRows([]);
        return;
      }

      const { data, error } = await supabase
        .from("users")
        .select("id,auth_user_id,name,email,phone,city,avatar_url,average_rating,total_ratings,completed_rides,blocked_at,block_reason,suspended_at,suspended_until,deleted_at,created_at,updated_at")
        .in("id", passengerIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRows((data ?? []) as PassengerRow[]);
    } catch (error) {
      setRows([]);
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar os passageiros.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const channel = supabase
      .channel("admin-canonical-passengers")
      .on("postgres_changes", { event: "*", schema: "public", table: "users" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === "ativos" && (row.blocked_at || row.suspended_at || row.deleted_at)) return false;
      if (filter === "suspensos" && !row.suspended_at) return false;
      if (filter === "bloqueados" && !row.blocked_at) return false;
      if (filter === "excluidos" && !row.deleted_at) return false;
      if (!needle) return true;
      return [row.name, row.email, row.phone, row.city]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [filter, query, rows]);

  async function mutate(row: PassengerRow, action: Action, reasonValue?: string | null) {
    setBusyId(row.id);
    try {
      await setAdminPassengerStatus(row.id, action, reasonValue ?? null);
      toast.success(
        action === "suspend" ? "Passageiro suspenso." :
        action === "unsuspend" ? "Suspensão removida." :
        action === "block" ? "Passageiro bloqueado." :
        action === "unblock" ? "Bloqueio removido." :
        "Exclusão operacional registrada.",
      );
      setReasonFor(null);
      setReason("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar o passageiro.");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmReasonAction() {
    if (!reasonFor || !reason.trim()) return;
    await mutate(reasonFor.row, reasonFor.action, reason.trim());
  }

  const counts = useMemo(() => ({
    active: rows.filter((row) => !row.blocked_at && !row.suspended_at && !row.deleted_at).length,
    suspended: rows.filter((row) => Boolean(row.suspended_at) && !row.deleted_at).length,
    blocked: rows.filter((row) => Boolean(row.blocked_at) && !row.deleted_at).length,
  }), [rows]);

  return (
    <AdminLayout
      title="Passageiros"
      description="Moderação apoiada na identidade canônica public.users + user_roles"
      actions={
        <DSButton variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </DSButton>
      }
    >
      <DSCard className="mb-4 border-primary/20 bg-primary/5">
        <DSCardContent className="p-4 text-sm text-muted-foreground">
          Bloqueio, suspensão e exclusão operacional são executados por RPC administrativa auditada. A ação "excluir" nesta tela é <strong>soft delete operacional</strong>; ela não afirma remover automaticamente o registro de <code>auth.users</code>.
        </DSCardContent>
      </DSCard>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Metric label="Ativos" value={counts.active} />
        <Metric label="Suspensos" value={counts.suspended} />
        <Metric label="Bloqueados" value={counts.blocked} />
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <DSInput className="pl-9" placeholder="Buscar por nome, e-mail, telefone ou cidade" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="todos">Todos</option>
          <option value="ativos">Ativos</option>
          <option value="suspensos">Suspensos</option>
          <option value="bloqueados">Bloqueados</option>
          <option value="excluidos">Exclusão operacional</option>
        </select>
      </div>

      {loading ? (
        <Loading label="Carregando passageiros..." />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum passageiro encontrado" description="Ajuste os filtros ou aguarde novos cadastros." />
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => {
            const status = statusFor(row);
            return (
              <DSCard key={row.id}>
                <DSCardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{row.name || "Passageiro sem nome"}</p>
                      <p className="truncate text-xs text-muted-foreground">{row.email || row.phone || "Sem contato"}</p>
                      <p className="text-xs text-muted-foreground">{row.city || "Cidade não informada"}</p>
                    </div>
                    <DSBadge variant={status.variant}>{status.label}</DSBadge>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>Avaliação: {row.average_rating == null ? "—" : Number(row.average_rating).toFixed(2)} ({row.total_ratings})</span>
                    <span>•</span>
                    <span>Corridas concluídas: {row.completed_rides}</span>
                    {row.block_reason && <><span>•</span><span className="text-destructive">Motivo: {row.block_reason}</span></>}
                  </div>

                  {!row.deleted_at && (
                    <div className="flex flex-wrap gap-2">
                      {row.suspended_at ? (
                        <DSButton variant="outline" size="sm" onClick={() => void mutate(row, "unsuspend")} disabled={busyId === row.id} className="gap-1">
                          <ShieldOff className="h-4 w-4" /> Remover suspensão
                        </DSButton>
                      ) : (
                        <DSButton variant="outline" size="sm" onClick={() => { setReasonFor({ row, action: "suspend" }); setReason(""); }} disabled={busyId === row.id} className="gap-1">
                          <ShieldOff className="h-4 w-4" /> Suspender
                        </DSButton>
                      )}
                      {row.blocked_at ? (
                        <DSButton variant="outline" size="sm" onClick={() => void mutate(row, "unblock")} disabled={busyId === row.id} className="gap-1">
                          <Ban className="h-4 w-4" /> Desbloquear
                        </DSButton>
                      ) : (
                        <DSButton variant="outline" size="sm" onClick={() => { setReasonFor({ row, action: "block" }); setReason(""); }} disabled={busyId === row.id} className="gap-1">
                          <Ban className="h-4 w-4" /> Bloquear
                        </DSButton>
                      )}
                      <DSButton variant="outline" size="sm" onClick={() => { setReasonFor({ row, action: "soft_delete" }); setReason(""); }} disabled={busyId === row.id} className="gap-1">
                        <Trash2 className="h-4 w-4" /> Exclusão operacional
                      </DSButton>
                    </div>
                  )}
                </DSCardContent>
              </DSCard>
            );
          })}
        </div>
      )}

      {reasonFor && (
        <DSCard className="mt-6 border-warning/30">
          <DSCardContent className="space-y-3 p-4">
            <p className="font-semibold">
              {reasonFor.action === "suspend" ? "Suspender" : reasonFor.action === "block" ? "Bloquear" : "Excluir operacionalmente"} — {reasonFor.row.name || reasonFor.row.id.slice(0, 8)}
            </p>
            <p className="text-xs text-muted-foreground">Informe o motivo. Ele será persistido pelo fluxo administrativo do servidor.</p>
            <DSTextarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="Motivo obrigatório" />
            <div className="flex gap-2">
              <DSButton variant="outline" onClick={() => { setReasonFor(null); setReason(""); }}>Cancelar</DSButton>
              <DSButton onClick={() => void confirmReasonAction()} disabled={!reason.trim() || busyId === reasonFor.row.id}>Confirmar</DSButton>
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
      <DSCardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-bold">{value}</p>
      </DSCardContent>
    </DSCard>
  );
}
