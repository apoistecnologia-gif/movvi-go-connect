import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Save, ShieldCheck } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { logAdminAction } from "@/lib/adminAudit";
import { grantAdminRole, revokeAdminRole } from "@/lib/adminRoles.functions";
import { formatDate } from "@/lib/formatters";

export const Route = createFileRoute("/admin/administradores")({
  head: () => ({ meta: [{ title: "Administradores — Admin MOVVI" }] }),
  component: AdminUsersPage,
});

const ROLES = ["super_admin", "admin", "financial", "operations", "support", "readonly"] as const;
type Role = (typeof ROLES)[number];

function mapRoleError(msg: string): string {
  if (msg === "forbidden") return "Apenas administradores podem alterar permissões.";
  if (msg === "cannot_revoke_self_admin") return "Você não pode remover sua própria permissão de admin.";
  if (msg === "invalid_role" || msg === "invalid_user_id") return "Dados inválidos.";
  return msg;
}

type AdminRow = {
  user_id: string;
  roles: Role[];
  display_name: string | null;
  phone: string | null;
  last_login_at: string | null;
};

function AdminUsersPage() {
  const grantRole = useServerFn(grantAdminRole);
  const revokeRole = useServerFn(revokeAdminRole);
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    const { data: r, error } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ROLES as unknown as never[]);
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const grouped = new Map<string, Role[]>();
    for (const row of (r ?? []) as { user_id: string; role: Role }[]) {
      const list = grouped.get(row.user_id) ?? [];
      list.push(row.role);
      grouped.set(row.user_id, list);
    }
    const ids = Array.from(grouped.keys());
    const metaRes = ids.length
      ? await supabase.from("admin_users_meta").select("*").in("user_id", ids)
      : { data: [] as { user_id: string; display_name: string | null; phone: string | null; last_login_at: string | null }[] };
    const metaMap = new Map<string, { display_name: string | null; phone: string | null; last_login_at: string | null }>();
    for (const m of metaRes.data ?? []) metaMap.set(m.user_id, m);
    setRows(
      ids.map((id) => ({
        user_id: id,
        roles: grouped.get(id) ?? [],
        display_name: metaMap.get(id)?.display_name ?? null,
        phone: metaMap.get(id)?.phone ?? null,
        last_login_at: metaMap.get(id)?.last_login_at ?? null,
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel("admin-roles")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  async function addRole(userId: string, role: Role) {
    try {
      await grantRole({ data: { userId, role } });
      await logAdminAction({ action: "admin.add_role", entity: "user_roles", entity_id: userId, after: { role } });
    } catch (e) {
      toast.error(e instanceof Error ? mapRoleError(e.message) : "Falha ao conceder permissão");
    }
  }
  async function removeRole(userId: string, role: Role) {
    try {
      await revokeRole({ data: { userId, role } });
      await logAdminAction({ action: "admin.remove_role", entity: "user_roles", entity_id: userId, before: { role } });
    } catch (e) {
      toast.error(e instanceof Error ? mapRoleError(e.message) : "Falha ao remover permissão");
    }
  }
  async function inviteByUserId() {
    const id = prompt("auth_user_id do usuário (precisa já estar cadastrado):")?.trim();
    if (!id) return;
    await addRole(id, "admin");
    toast.success("Permissão de admin concedida");
  }
  async function saveMeta(r: AdminRow) {
    const { error } = await supabase
      .from("admin_users_meta")
      .upsert({ user_id: r.user_id, display_name: r.display_name, phone: r.phone }, { onConflict: "user_id" });
    if (error) return toast.error(error.message);
    toast.success("Atualizado");
  }
  function patch(id: string, p: Partial<AdminRow>) {
    setRows((rs) => rs.map((r) => (r.user_id === id ? { ...r, ...p } : r)));
  }
  async function removeAll(r: AdminRow) {
    if (!confirm("Remover TODAS as permissões deste administrador?")) return;
    for (const role of r.roles) await removeRole(r.user_id, role);
    toast.success("Permissões removidas");
  }

  return (
    <AdminLayout
      title="Administradores"
      description={`${rows.length} contas com acesso administrativo`}
      actions={
        <Button onClick={inviteByUserId} size="sm" className="gap-1">
          <Plus className="h-4 w-4" /> Conceder admin
        </Button>
      }
    >
      {loading ? (
        <div className="grid place-items-center py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Nenhum administrador cadastrado.</p>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => (
            <Card key={r.user_id} className="border-border bg-card/60">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <span className="font-mono text-xs">{r.user_id}</span>
                  {r.last_login_at && (
                    <Badge variant="outline" className="ml-auto text-[10px]">
                      último login {formatDate(r.last_login_at)}
                    </Badge>
                  )}
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-semibold uppercase text-muted-foreground">Nome</span>
                    <input
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      value={r.display_name ?? ""}
                      onChange={(e) => patch(r.user_id, { display_name: e.target.value })}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-semibold uppercase text-muted-foreground">Telefone</span>
                    <input
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      value={r.phone ?? ""}
                      onChange={(e) => patch(r.user_id, { phone: e.target.value })}
                    />
                  </label>
                  <div className="flex items-end gap-2">
                    <Button size="sm" onClick={() => saveMeta(r)} className="gap-1">
                      <Save className="h-3 w-3" /> Salvar
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeAll(r)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {ROLES.map((role) => {
                    const has = r.roles.includes(role);
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => (has ? removeRole(r.user_id, role) : addRole(r.user_id, role))}
                        className={`rounded-full border px-3 py-1 text-[11px] transition ${
                          has
                            ? "border-primary bg-primary/15 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        {role}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
