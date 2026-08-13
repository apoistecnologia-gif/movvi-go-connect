/* eslint-disable @typescript-eslint/no-explicit-any -- Temporary Phase 8 bridge until generated Supabase types include canonical admin RPCs. */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Save, ShieldCheck, UserX } from "lucide-react";
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
import { formatDate } from "@/lib/formatters";

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

type AdminRow = {
  user_id: string;
  email: string;
  display_name: string;
  role: CanonicalStaffRole;
  active: boolean;
  updated_at: string;
};

function AdminUsersPage() {
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("profiles")
      .select("user_id,email,display_name,role,active,updated_at")
      .order("display_name", { ascending: true });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as AdminRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel("admin-staff-profiles")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  function patch(id: string, next: Partial<AdminRow>) {
    setRows((current) => current.map((row) => (row.user_id === id ? { ...row, ...next } : row)));
  }

  async function save(row: AdminRow) {
    setSavingId(row.user_id);
    try {
      await setAdminStaffProfile({
        authUserId: row.user_id,
        role: row.role,
        active: row.active,
        displayName: row.display_name,
      });
      toast.success("Permissões atualizadas");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a equipe.");
    } finally {
      setSavingId(null);
    }
  }

  async function provision() {
    const authUserId = prompt("ID do usuário no Auth (UUID):")?.trim();
    if (!authUserId) return;
    const roleInput = prompt(
      "Função: administrator, support, reader, editor ou marketing",
      "support",
    )?.trim() as CanonicalStaffRole | undefined;
    if (!roleInput || !ROLES.some((item) => item.value === roleInput)) {
      toast.error("Função administrativa inválida.");
      return;
    }
    const displayName = prompt("Nome exibido (opcional):")?.trim() || null;
    try {
      await provisionAdminStaff({ authUserId, role: roleInput, displayName });
      toast.success("Acesso administrativo provisionado");
      await refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível provisionar o acesso.",
      );
    }
  }

  return (
    <AdminLayout
      title="Equipe administrativa"
      description={`${rows.length} perfis de staff no RBAC canônico`}
      actions={
        <DSButton onClick={() => void provision()} size="sm" className="gap-1">
          <Plus className="h-4 w-4" /> Conceder acesso
        </DSButton>
      }
    >
      <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
        O acesso do painel usa <strong>profiles.role → role_permissions</strong>. Perfis de
        passageiro/motorista em
        <strong> user_roles</strong> não concedem privilégios administrativos.
      </div>

      {loading ? (
        <Loading label="Carregando equipe..." />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nenhum perfil administrativo"
          description="Provisione uma conta Auth existente para iniciar o RBAC do painel."
        />
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => (
            <DSCard key={row.user_id}>
              <DSCardContent className="space-y-4 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <span className="font-mono text-xs">{row.user_id}</span>
                  <div className="ml-auto">
                    <StatusPill
                      status={row.active ? "online" : "offline"}
                      label={row.active ? "Ativo" : "Desativado"}
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <label className="flex flex-col gap-1 text-xs">
                    <DSLabel>Nome</DSLabel>
                    <DSInput
                      value={row.display_name ?? ""}
                      onChange={(event) => patch(row.user_id, { display_name: event.target.value })}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <DSLabel>E-mail</DSLabel>
                    <DSInput value={row.email ?? ""} disabled />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <DSLabel>Função</DSLabel>
                    <select
                      value={row.role}
                      onChange={(event) =>
                        patch(row.user_id, { role: event.target.value as CanonicalStaffRole })
                      }
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {ROLES.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={row.active}
                      onCheckedChange={(active) => patch(row.user_id, { active })}
                    />
                    <div>
                      <p className="text-xs font-medium">Acesso ativo</p>
                      <Caption>Atualizado {formatDate(row.updated_at)}</Caption>
                    </div>
                  </div>
                  <DSButton
                    size="sm"
                    onClick={() => void save(row)}
                    disabled={savingId === row.user_id}
                    className="gap-1"
                  >
                    {savingId === row.user_id ? (
                      <UserX className="h-3 w-3 animate-pulse" />
                    ) : (
                      <Save className="h-3 w-3" />
                    )}
                    Salvar
                  </DSButton>
                </div>
              </DSCardContent>
            </DSCard>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
