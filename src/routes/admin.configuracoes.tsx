import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Save, Sliders, ShieldCheck } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { DSBadge, DSButton, DSCard, DSCardContent, DSInput, Loading } from "@/design-system";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Admin APOIS" }] }),
  component: AdminConfigPage,
});

type EditableSetting = {
  key: "ride.cancellation_fee_amount" | "ride.cancellation_free_minutes" | "ride.next_offer_max_distance_km" | "finance.platform_fee_percent";
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  suffix: string;
};

const EDITABLE_SETTINGS: EditableSetting[] = [
  {
    key: "ride.cancellation_fee_amount",
    label: "Multa padrão de cancelamento",
    description: "Valor aplicado quando a regra server-side determinar cobrança.",
    min: 0,
    max: 1000,
    step: 0.01,
    suffix: "R$",
  },
  {
    key: "ride.cancellation_free_minutes",
    label: "Janela sem multa",
    description: "Minutos iniciais em que o cancelamento pode permanecer isento conforme o lifecycle.",
    min: 0,
    max: 60,
    step: 1,
    suffix: "min",
  },
  {
    key: "ride.next_offer_max_distance_km",
    label: "Raio da próxima corrida",
    description: "Distância máxima para oferecer nova corrida a motorista elegível próximo do fim da atual.",
    min: 0.5,
    max: 20,
    step: 0.5,
    suffix: "km",
  },
  {
    key: "finance.platform_fee_percent",
    label: "Taxa da plataforma",
    description: "Percentual server-side destinado à APOIS. A regra atual do projeto é 0%.",
    min: 0,
    max: 100,
    step: 0.01,
    suffix: "%",
  },
];

function AdminConfigPage() {
  const [values, setValues] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const keys = EDITABLE_SETTINGS.map((item) => item.key);
    const { data, error } = await (supabase as any)
      .from("app_settings")
      .select("key,value")
      .in("key", keys);
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const next: Record<string, number> = {};
    for (const row of data ?? []) {
      const value = Number(row.value);
      if (Number.isFinite(value)) next[String(row.key)] = value;
    }
    setValues(next);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    const channel = supabase
      .channel("admin-canonical-settings")
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  async function save(item: EditableSetting) {
    const value = Number(values[item.key]);
    if (!Number.isFinite(value) || value < item.min || value > item.max) {
      toast.error(`Valor inválido. Use entre ${item.min} e ${item.max}.`);
      return;
    }
    setSaving(item.key);
    try {
      const { error } = await (supabase as any).rpc("admin_update_setting", {
        _key: item.key,
        _value: value,
      });
      if (error) throw error;
      toast.success("Configuração salva e auditada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a configuração.");
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <AdminLayout title="Configurações">
        <Loading label="Carregando configurações canônicas..." />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Configurações"
      description="Somente regras realmente ligadas ao backend canônico podem ser alteradas aqui."
    >
      <DSCard className="mb-4 border-primary/20 bg-primary/5">
        <DSCardContent className="flex gap-3 p-4 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-semibold text-foreground">Configuração server-side e auditada</p>
            <p className="mt-1">
              Chaves de Google, Firebase, Mercado Pago, payout e outros secrets não são editadas no navegador. Elas permanecem em secrets/infraestrutura.
            </p>
          </div>
        </DSCardContent>
      </DSCard>

      <div className="grid gap-4 lg:grid-cols-2">
        {EDITABLE_SETTINGS.map((item) => {
          const value = values[item.key] ?? 0;
          return (
            <DSCard key={item.key}>
              <DSCardContent className="space-y-4 p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Sliders className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{item.label}</h2>
                      <DSBadge variant="muted">{item.key}</DSBadge>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <DSInput
                    type="number"
                    min={item.min}
                    max={item.max}
                    step={item.step}
                    value={value}
                    onChange={(event) => setValues((current) => ({ ...current, [item.key]: Number(event.target.value) }))}
                  />
                  <span className="min-w-10 text-xs font-semibold text-muted-foreground">{item.suffix}</span>
                  <DSButton onClick={() => void save(item)} disabled={saving === item.key}>
                    {saving === item.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar
                  </DSButton>
                </div>
              </DSCardContent>
            </DSCard>
          );
        })}
      </div>
    </AdminLayout>
  );
}
