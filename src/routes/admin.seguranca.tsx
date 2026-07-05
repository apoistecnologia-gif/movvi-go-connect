import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Save, Shield, Lock, KeyRound, Clock } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { logAdminAction } from "@/lib/adminAudit";
import { DSButton, DSCard, DSCardContent, DSCardDescription, DSCardHeader, DSCardTitle } from "@/design-system";

export const Route = createFileRoute("/admin/seguranca")({
  head: () => ({ meta: [{ title: "Segurança — Admin MOVVI" }] }),
  component: AdminSecurityPage,
});

type SecurityRow = {
  id: number;
  max_login_attempts: number;
  session_timeout_minutes: number;
  require_2fa: boolean;
  audit_logs_enabled: boolean;
  password_policy: {
    min_length: number;
    require_uppercase: boolean;
    require_number: boolean;
    require_symbol: boolean;
  };
};

const DEFAULT: SecurityRow = {
  id: 1,
  max_login_attempts: 5,
  session_timeout_minutes: 120,
  require_2fa: false,
  audit_logs_enabled: true,
  password_policy: { min_length: 8, require_uppercase: true, require_number: true, require_symbol: false },
};

function AdminSecurityPage() {
  const [row, setRow] = useState<SecurityRow>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from("security_settings").select("*").eq("id", 1).maybeSingle();
      if (!alive) return;
      if (error) toast.error(error.message);
      if (data) setRow({ ...DEFAULT, ...(data as unknown as SecurityRow) });
      setLoading(false);
    })();
    const ch = supabase
      .channel("admin-security")
      .on("postgres_changes", { event: "*", schema: "public", table: "security_settings" }, async () => {
        const { data } = await supabase.from("security_settings").select("*").eq("id", 1).maybeSingle();
        if (alive && data) setRow({ ...DEFAULT, ...(data as unknown as SecurityRow) });
      })
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, []);

  async function save() {
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("security_settings")
      .upsert(
        {
          id: 1,
          max_login_attempts: row.max_login_attempts,
          session_timeout_minutes: row.session_timeout_minutes,
          require_2fa: row.require_2fa,
          audit_logs_enabled: row.audit_logs_enabled,
          password_policy: row.password_policy as never,
          updated_by: u?.user?.id ?? null,
        },
        { onConflict: "id" },
      );
    setSaving(false);
    if (error) return toast.error(error.message);
    await logAdminAction({ action: "security.update", entity: "security_settings", after: row });
    toast.success("Política de segurança atualizada");
  }

  if (loading) {
    return (
      <AdminLayout title="Segurança">
        <div className="grid place-items-center py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Segurança"
      description="Política global de autenticação, sessão e auditoria."
      actions={
        <DSButton onClick={save} disabled={saving} size="sm" className="gap-1">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Salvar tudo
        </DSButton>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <DSCard className="border-border bg-card/60">
          <DSCardHeader>
            <DSCardTitle className="flex items-center gap-2 text-base">
              <Lock className="h-4 w-4 text-primary" />
              Autenticação
            </DSCardTitle>
            <DSCardDescription className="text-xs">Controle de acesso e proteções contra ataque de força bruta.</DSCardDescription>
          </DSCardHeader>
          <DSCardContent className="space-y-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tentativas máximas de login</span>
              <Input
                type="number"
                min={1}
                value={row.max_login_attempts}
                onChange={(e) => setRow({ ...row, max_login_attempts: Number(e.target.value) || 1 })}
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/40 p-3">
              <div>
                <p className="text-sm font-medium">Exigir 2FA</p>
                <p className="text-[11px] text-muted-foreground">Autenticação em dois fatores para administradores.</p>
              </div>
              <Switch checked={row.require_2fa} onCheckedChange={(v) => setRow({ ...row, require_2fa: v })} />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/40 p-3">
              <div>
                <p className="text-sm font-medium">Logs de auditoria</p>
                <p className="text-[11px] text-muted-foreground">Registra ações administrativas sensíveis.</p>
              </div>
              <Switch checked={row.audit_logs_enabled} onCheckedChange={(v) => setRow({ ...row, audit_logs_enabled: v })} />
            </label>
          </DSCardContent>
        </DSCard>

        <DSCard className="border-border bg-card/60">
          <DSCardHeader>
            <DSCardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-primary" />
              Sessão
            </DSCardTitle>
            <DSCardDescription className="text-xs">Tempo até expirar uma sessão inativa.</DSCardDescription>
          </DSCardHeader>
          <DSCardContent>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Timeout de sessão (minutos)</span>
              <Input
                type="number"
                min={5}
                value={row.session_timeout_minutes}
                onChange={(e) => setRow({ ...row, session_timeout_minutes: Number(e.target.value) || 5 })}
              />
            </label>
          </DSCardContent>
        </DSCard>

        <DSCard className="border-border bg-card/60 lg:col-span-2">
          <DSCardHeader>
            <DSCardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4 text-primary" />
              Política de senha
            </DSCardTitle>
            <DSCardDescription className="text-xs">Aplicada a novos cadastros e trocas de senha.</DSCardDescription>
          </DSCardHeader>
          <DSCardContent className="grid gap-3 md:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tamanho mínimo</span>
              <Input
                type="number"
                min={4}
                value={row.password_policy.min_length}
                onChange={(e) =>
                  setRow({ ...row, password_policy: { ...row.password_policy, min_length: Number(e.target.value) || 4 } })
                }
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/40 p-3">
              <span className="text-sm">Maiúscula</span>
              <Switch
                checked={row.password_policy.require_uppercase}
                onCheckedChange={(v) => setRow({ ...row, password_policy: { ...row.password_policy, require_uppercase: v } })}
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/40 p-3">
              <span className="text-sm">Número</span>
              <Switch
                checked={row.password_policy.require_number}
                onCheckedChange={(v) => setRow({ ...row, password_policy: { ...row.password_policy, require_number: v } })}
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/40 p-3">
              <span className="text-sm">Símbolo</span>
              <Switch
                checked={row.password_policy.require_symbol}
                onCheckedChange={(v) => setRow({ ...row, password_policy: { ...row.password_policy, require_symbol: v } })}
              />
            </label>
          </DSCardContent>
        </DSCard>

        <DSCard className="border-border bg-card/60 lg:col-span-2">
          <DSCardHeader>
            <DSCardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-primary" />
              Auditoria
            </DSCardTitle>
            <DSCardDescription className="text-xs">
              Veja todas as ações administrativas em <a href="/admin/logs" className="text-primary underline">/admin/logs</a>.
            </DSCardDescription>
          </DSCardHeader>
        </DSCard>
      </div>
    </AdminLayout>
  );
}
