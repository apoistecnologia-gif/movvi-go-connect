/* eslint-disable @typescript-eslint/no-explicit-any -- Temporary Phase 8 bridge until generated Supabase types include canonical admin RPCs. */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Plus, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import {
  Caption,
  DSButton,
  DSCard,
  DSCardContent,
  DSInput,
  EmptyState,
  Label as DSLabel,
  Loading,
  StatusPill,
} from "@/design-system";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  provisionAdminStaff,
  setAdminStaffProfile,
  type CanonicalStaffRole,
} from "@/lib/adminControlPlane";

export const Route = createFileRoute("/admin/administradores")({
  head: () => ({ meta: [{ title: "Equipe administrativa — Admin APOIS" }] }),
  component: AdminUsersPage,
});

const ROLES: Array<{ value: CanonicalStaffRole; label: string }> = [
  { value: "administrator", label: "Administrador" },
  { value: "support", label: "Suporte / Operações" },
  { value: "reader", label: "Somente leitura" },
  { value: "editor", label: "Editor de conteúdo" },
  { value: "marketing", label: "Marketing" },
];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AdminRow = {
  user_id: string;
  email: string;
  display_name: string;
  role: CanonicalStaffRole;
  active: boolean;
  updated_at: string;
};

function cleanText(value: unknown, max = 120) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function roleIsValid(value: unknown): value is CanonicalStaffRole {
  return ROLES.some((item) => item.value === value);
}

function safeUpdatedLabel(value: unknown) {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "data não informada";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function AdminUsersPage() {
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const dirtyIdsRef = useRef(new Set<string>());
  const requestRef = useRef(0);

  async function refresh({ preserveDirty = true }: { preserveDirty?: boolean } = {}) {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    const { data, error } = await (supabase as any)
      .from("profiles")
      .select("user_id,email,display_name,role,active,updated_at")
      .order("display_name", { ascending: true });
    if (requestId !== requestRef.current) return;
    if (error) {
      setLoadError("Não foi possível carregar a equipe administrativa agora.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao carregar equipe", error);
      setLoading(false);
      return;
    }

    const incoming = ((data ?? []) as Partial<AdminRow>[])
      .map((row) => {
        const userId = cleanText(row.user_id, 64);
        if (!UUID_RE.test(userId) || !roleIsValid(row.role)) return null;
        return {
          user_id: userId,
          email: cleanText(row.email, 200),
          display_name: cleanText(row.display_name, 80),
          role: row.role,
          active: row.active === true,
          updated_at: String(row.updated_at ?? ""),
        } satisfies AdminRow;
      })
      .filter((row): row is AdminRow => Boolean(row));

    setRows((current) => {
      if (!preserveDirty || dirtyIdsRef.current.size === 0) return incoming;
      const currentById = new Map(current.map((row) => [row.user_id, row]));
      return incoming.map((row) => dirtyIdsRef.current.has(row.user_id) ? (currentById.get(row.user_id) ?? row) : row);
    });
    setLoading(false);
  }

  useEffect(() => {
    void refresh({ preserveDirty: false });
    let refreshTimer: number | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void refresh({ preserveDirty: true }), 250);
    };
    const channel = supabase.channel("admin-staff-profiles").on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, scheduleRefresh).subscribe();
    return () => {
      requestRef.current += 1;
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, []);

  function patch(id: string, next: Partial<AdminRow>) {
    if (savingId || provisioning) return;
    dirtyIdsRef.current.add(id);
    setRowError(null);
    setRows((current) => current.map((row) => row.user_id === id ? { ...row, ...next } : row));
  }

  async function save(row: AdminRow) {
    if (savingId || provisioning) return;
    const displayName = cleanText(row.display_name, 80);
    if (!UUID_RE.test(row.user_id) || !roleIsValid(row.role)) {
      setRowError({ id: row.user_id, message: "Este perfil administrativo possui dados inválidos." });
      return;
    }
    setSavingId(row.user_id);
    setRowError(null);
    try {
      await setAdminStaffProfile({ authUserId: row.user_id, role: row.role, active: row.active === true, displayName });
      dirtyIdsRef.current.delete(row.user_id);
      toast.success("Permissões atualizadas");
      await refresh({ preserveDirty: true });
    } catch (error) {
      setRowError({ id: row.user_id, message: "Não foi possível atualizar este acesso agora." });
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao atualizar equipe", error);
    } finally {
      setSavingId(null);
    }
  }

  async function provision() {
    if (savingId || provisioning) return;
    const authUserId = prompt("ID do usuário no Auth (UUID):")?.trim() ?? "";
    if (!authUserId) return;
    if (!UUID_RE.test(authUserId)) {
      toast.error("Informe um UUID válido do usuário no Auth.");
      return;
    }
    const roleInput = prompt("Função: administrator, support, reader, editor ou marketing", "support")?.trim();
    if (!roleIsValid(roleInput)) {
      toast.error("Função administrativa inválida.");
      return;
    }
    const displayName = cleanText(prompt("Nome exibido (opcional):") ?? "", 80) || null;
    setProvisioning(true);
    try {
      await provisionAdminStaff({ authUserId, role: roleInput, displayName });
      toast.success("Acesso administrativo provisionado");
      await refresh({ preserveDirty: true });
    } catch (error) {
      toast.error("Não foi possível provisionar o acesso agora.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao provisionar acesso", error);
    } finally {
      setProvisioning(false);
    }
  }

  return (
    <AdminLayout
      title="Equipe administrativa"
      description={`${rows.length} ${rows.length === 1 ? "perfil" : "perfis"} de staff no RBAC canônico`}
      actions={<DSButton onClick={() => void provision()} size="sm" className="min-h-11 gap-2" disabled={Boolean(savingId) || provisioning} aria-busy={provisioning}><Plus className="h-4 w-4" aria-hidden="true" />{provisioning ? "Concedendo…" : "Conceder acesso"}</DSButton>}
    >
      <div className="mb-4 min-w-0 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">O acesso do painel usa <strong>profiles.role → role_permissions</strong>. Perfis de passageiro ou motorista em <strong>user_roles</strong> não concedem privilégios administrativos.</div>

      {loading ? <div aria-live="polite"><Loading label="Carregando equipe..." /></div> : loadError ? (
        <DSCard className="border-destructive/30 bg-destructive/5"><DSCardContent className="space-y-3 p-4" role="alert"><p className="text-sm font-medium text-destructive">{loadError}</p><DSButton variant="outline" className="min-h-11 gap-2" onClick={() => void refresh({ preserveDirty: true })}><RefreshCw className="h-4 w-4" aria-hidden="true" />Tentar novamente</DSButton></DSCardContent></DSCard>
      ) : rows.length === 0 ? <EmptyState icon={ShieldCheck} title="Nenhum perfil administrativo" description="Provisione uma conta Auth existente para iniciar o RBAC do painel." /> : (
        <div className="grid gap-3">
          {rows.map((row) => {
            const busy = savingId === row.user_id;
            const dirty = dirtyIdsRef.current.has(row.user_id);
            const error = rowError?.id === row.user_id ? rowError.message : null;
            return <DSCard key={row.user_id}><DSCardContent className="space-y-4 p-4" aria-busy={busy}>
              <div className="flex min-w-0 flex-wrap items-center gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span className="min-w-0 break-all font-mono text-xs">{row.user_id}</span><div className="ml-auto"><StatusPill status={row.active ? "online" : "offline"} label={row.active ? "Ativo" : "Desativado"} /></div></div>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="flex min-w-0 flex-col gap-1 text-sm"><DSLabel>Nome</DSLabel><DSInput value={row.display_name} maxLength={80} disabled={Boolean(savingId) || provisioning} className="min-h-11 text-base" onChange={(event) => patch(row.user_id, { display_name: event.target.value })} /></label>
                <label className="flex min-w-0 flex-col gap-1 text-sm"><DSLabel>E-mail</DSLabel><DSInput value={row.email} disabled className="min-h-11 text-base" /></label>
                <label className="flex min-w-0 flex-col gap-1 text-sm"><DSLabel>Função</DSLabel><select value={row.role} disabled={Boolean(savingId) || provisioning} onChange={(event) => { const value = event.target.value; if (roleIsValid(value)) patch(row.user_id, { role: value }); }} className="min-h-11 rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60">{ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
              </div>
              {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive" role="alert">{error}</p> : null}
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3"><label className="flex min-h-11 items-center gap-3 rounded-lg px-1 focus-within:ring-2 focus-within:ring-primary"><Switch checked={row.active} disabled={Boolean(savingId) || provisioning} onCheckedChange={(active) => patch(row.user_id, { active })} aria-label={`${row.display_name || row.email || "Usuário"}: acesso administrativo ativo`} /><div className="min-w-0"><p className="text-sm font-medium">Acesso ativo</p><Caption>Atualizado {safeUpdatedLabel(row.updated_at)}</Caption></div></label><div className="flex flex-wrap items-center gap-2">{dirty ? <span className="text-sm text-muted-foreground">Alterações não salvas</span> : null}<DSButton size="sm" onClick={() => void save(row)} disabled={Boolean(savingId) || provisioning || !dirty} className="min-h-11 gap-2" aria-busy={busy}>{busy ? <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}{busy ? "Salvando…" : dirty ? "Salvar" : "Salvo"}</DSButton></div></div>
            </DSCardContent></DSCard>;
          })}
        </div>
      )}
    </AdminLayout>
  );
}
