import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { logAdminAction } from "@/lib/adminAudit";

export const Route = createFileRoute("/admin/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Admin MOVVI" }] }),
  component: AdminConfigPage,
});

type Setting = { key: string; value: unknown; description: string | null; category: string | null };

type FieldDef = { key: string; label: string; type: "text" | "number" | "bool"; group: string; help?: string };

const FIELDS: FieldDef[] = [
  { key: "platform.name", label: "Nome da plataforma", type: "text", group: "Identidade" },
  { key: "support.email", label: "E-mail de suporte", type: "text", group: "Identidade" },
  { key: "support.phone", label: "Telefone de suporte", type: "text", group: "Identidade" },
  { key: "support.whatsapp", label: "WhatsApp", type: "text", group: "Identidade" },
  { key: "currency.code", label: "Moeda", type: "text", group: "Localidade" },
  { key: "country.code", label: "País", type: "text", group: "Localidade" },
  { key: "timezone", label: "Fuso horário", type: "text", group: "Localidade" },

  { key: "map.max_driver_distance_km", label: "Distância máx do motorista (km)", type: "number", group: "Operação" },
  { key: "ride.request_timeout_sec", label: "Timeout da solicitação (s)", type: "number", group: "Operação" },
  { key: "ride.driver_response_timeout_sec", label: "Timeout de resposta do motorista (s)", type: "number", group: "Operação" },
  { key: "ride.max_cancellation_minutes", label: "Tempo máx p/ cancelar sem multa (min)", type: "number", group: "Operação" },
  { key: "multiplier.night_start_hour", label: "Início tarifa noturna", type: "number", group: "Operação" },
  { key: "multiplier.night_end_hour", label: "Fim tarifa noturna", type: "number", group: "Operação" },

  { key: "payment.allow_cash", label: "Aceitar dinheiro", type: "bool", group: "Pagamento" },
  { key: "payment.allow_pix", label: "Aceitar PIX", type: "bool", group: "Pagamento" },
  { key: "payment.allow_credit_card", label: "Aceitar cartão", type: "bool", group: "Pagamento" },

  { key: "ride.allow_scheduled", label: "Permitir corridas agendadas", type: "bool", group: "Recursos" },
  { key: "ride.require_gps", label: "Exigir GPS", type: "bool", group: "Recursos" },
  { key: "driver.require_approval", label: "Exigir aprovação de motoristas", type: "bool", group: "Recursos" },
  { key: "promotions.enabled", label: "Habilitar promoções", type: "bool", group: "Recursos" },
  { key: "notifications.enabled", label: "Habilitar notificações", type: "bool", group: "Recursos" },
];

function AdminConfigPage() {
  const [map, setMap] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("app_settings").select("*");
      if (error) toast.error(error.message);
      const m: Record<string, unknown> = {};
      for (const r of (data ?? []) as Setting[]) m[r.key] = r.value;
      setMap(m);
      setLoading(false);
    })();
  }, []);

  function set(key: string, value: unknown) {
    setMap((m) => ({ ...m, [key]: value }));
  }

  async function save() {
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const rows = FIELDS.map((f) => ({
      key: f.key,
      value: map[f.key] as never,
      updated_by: u?.user?.id ?? null,
    }));
    const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
    setSaving(false);
    if (error) return toast.error(error.message);
    await logAdminAction({ action: "settings.update", entity: "app_settings", after: { keys: rows.length } });
    toast.success("Configurações salvas");
  }

  const groups = useMemo(() => {
    const g: Record<string, FieldDef[]> = {};
    for (const f of FIELDS) (g[f.group] ??= []).push(f);
    return g;
  }, []);

  if (loading) {
    return (
      <AdminLayout title="Configurações">
        <div className="grid place-items-center py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Configurações da Plataforma"
      description="Aplicado em tempo real em todo o app"
      actions={
        <Button onClick={save} disabled={saving} className="gap-1">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar tudo
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {Object.entries(groups).map(([group, fields]) => (
          <Card key={group} className="border-border bg-card/60">
            <CardHeader>
              <CardTitle className="text-base">{group}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {fields.map((f) => {
                const raw = map[f.key];
                if (f.type === "bool") {
                  return (
                    <label key={f.key} className="flex items-center justify-between gap-2 text-sm">
                      <span>{f.label}</span>
                      <Switch checked={!!raw} onCheckedChange={(v) => set(f.key, v)} />
                    </label>
                  );
                }
                return (
                  <label key={f.key} className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{f.label}</span>
                    <Input
                      type={f.type === "number" ? "number" : "text"}
                      value={raw == null ? "" : String(typeof raw === "object" ? JSON.stringify(raw) : raw).replace(/^"|"$/g, "")}
                      onChange={(e) =>
                        set(
                          f.key,
                          f.type === "number" ? Number(e.target.value) || 0 : e.target.value,
                        )
                      }
                    />
                  </label>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </AdminLayout>
  );
}
