import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, Building2, LifeBuoy, Globe, Sliders, Bell, Shield, CreditCard } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import {
  DSButton as Button,
  DSCard as Card,
  DSCardContent as CardContent,
  DSCardDescription as CardDescription,
  DSCardHeader as CardHeader,
  DSCardTitle as CardTitle,
  Loading,
} from "@/design-system";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { logAdminAction } from "@/lib/adminAudit";

export const Route = createFileRoute("/admin/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Admin MOVVI" }] }),
  component: AdminConfigPage,
});

type FieldDef = {
  key: string;
  label: string;
  type: "text" | "number" | "bool";
  help?: string;
  placeholder?: string;
};

type Section = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  fields: FieldDef[];
};

const SECTIONS: Section[] = [
  {
    id: "company",
    label: "Empresa",
    icon: Building2,
    description: "Identidade legal e endereço da operação.",
    fields: [
      { key: "company.name", label: "Razão social", type: "text", placeholder: "MOVVI DRIVE LTDA" },
      { key: "company.cnpj", label: "CNPJ", type: "text", placeholder: "00.000.000/0000-00" },
      { key: "company.address", label: "Endereço completo", type: "text", placeholder: "Rua, número, cidade — UF" },
      { key: "company.support_hours", label: "Horário de atendimento", type: "text", placeholder: "24/7 ou Seg-Sex 8h-18h" },
      { key: "platform.name", label: "Nome exibido no app", type: "text" },
      { key: "country.code", label: "País (ISO)", type: "text", placeholder: "BR" },
      { key: "currency.code", label: "Moeda (ISO)", type: "text", placeholder: "BRL" },
      { key: "timezone", label: "Fuso horário", type: "text", placeholder: "America/Sao_Paulo" },
    ],
  },
  {
    id: "support",
    label: "Suporte",
    icon: LifeBuoy,
    description: "Canais de atendimento exibidos para passageiros e motoristas.",
    fields: [
      { key: "support.email", label: "E-mail de suporte", type: "text" },
      { key: "support.phone", label: "Telefone de suporte", type: "text" },
      { key: "support.whatsapp", label: "WhatsApp", type: "text" },
      { key: "legal.terms_url", label: "Termos de uso (URL)", type: "text" },
      { key: "legal.privacy_url", label: "Política de privacidade (URL)", type: "text" },
    ],
  },
  {
    id: "integrations",
    label: "Integrações",
    icon: Globe,
    description: "Conexões com Google, Firebase e Realtime. As chaves ficam em secrets — aqui apenas o nome de referência.",
    fields: [
      { key: "google.maps_browser_key_name", label: "Secret da chave Google (navegador)", type: "text", help: "Use a chave do conector Google Maps." },
      { key: "google.maps_server_key_name", label: "Secret da chave Google (servidor)", type: "text" },
      { key: "google.places_enabled", label: "Google Places habilitado", type: "bool" },
      { key: "google.routes_enabled", label: "Google Routes habilitado", type: "bool" },
      { key: "firebase.project_id", label: "Firebase Project ID", type: "text" },
      { key: "realtime.enabled", label: "Realtime habilitado", type: "bool" },
    ],
  },
  {
    id: "operations",
    label: "Operação",
    icon: Sliders,
    description: "Regras de despacho, cancelamento e limites operacionais.",
    fields: [
      { key: "map.max_driver_distance_km", label: "Raio máximo de busca de motorista (km)", type: "number" },
      { key: "ride.max_pickup_distance_km", label: "Distância máxima até embarque (km)", type: "number" },
      { key: "ride.max_waiting_minutes", label: "Tempo máximo de espera (min)", type: "number" },
      { key: "ride.driver_response_timeout_sec", label: "Timeout de aceite do motorista (s)", type: "number" },
      { key: "ride.request_timeout_sec", label: "Timeout total da solicitação (s)", type: "number" },
      { key: "passenger.cancellation_grace_sec", label: "Cancelamento passageiro sem multa (s)", type: "number" },
      { key: "driver.cancellation_grace_sec", label: "Cancelamento motorista sem penalidade (s)", type: "number" },
      { key: "ride.max_distance_km", label: "Distância máxima da corrida (km)", type: "number" },
      { key: "ride.max_stops", label: "Paradas máximas", type: "number" },
      { key: "ride.max_simultaneous_requests", label: "Solicitações simultâneas por passageiro", type: "number" },
      { key: "ride.allow_scheduled", label: "Permitir corridas agendadas", type: "bool" },
      { key: "ride.require_gps", label: "Exigir GPS ativo", type: "bool" },
      { key: "driver.require_approval", label: "Exigir aprovação de motoristas", type: "bool" },
      { key: "pricing.dynamic_enabled", label: "Preço dinâmico habilitado", type: "bool" },
      { key: "promotions.enabled", label: "Promoções habilitadas", type: "bool" },
      { key: "multiplier.night_start_hour", label: "Início tarifa noturna (h)", type: "number" },
      { key: "multiplier.night_end_hour", label: "Fim tarifa noturna (h)", type: "number" },
      { key: "multiplier.night_value", label: "Multiplicador noturno", type: "number" },
      { key: "multiplier.peak_start_hour", label: "Início horário de pico (h)", type: "number" },
      { key: "multiplier.peak_end_hour", label: "Fim horário de pico (h)", type: "number" },
      { key: "multiplier.peak_value", label: "Multiplicador de pico", type: "number" },
    ],
  },
  {
    id: "payments",
    label: "Pagamentos",
    icon: CreditCard,
    description: "Métodos aceitos e assinatura do motorista. Configure os gateways em Pagamentos.",
    fields: [
      { key: "payment.allow_cash", label: "Aceitar dinheiro", type: "bool" },
      { key: "payment.allow_pix", label: "Aceitar PIX", type: "bool" },
      { key: "payment.allow_credit_card", label: "Aceitar cartão de crédito", type: "bool" },
      { key: "payment.allow_debit_card", label: "Aceitar cartão de débito", type: "bool" },
      { key: "payment.allow_wallet", label: "Aceitar carteira interna", type: "bool" },
      { key: "subscription.default_plan_price", label: "Assinatura mensal padrão (R$)", type: "number" },
      { key: "subscription.grace_days", label: "Período de carência (dias)", type: "number" },
      { key: "subscription.auto_suspend", label: "Suspender automaticamente vencidos", type: "bool" },
    ],
  },
  {
    id: "notifications",
    label: "Notificações",
    icon: Bell,
    description: "Canais ativos. Credenciais ficam em Notificações.",
    fields: [
      { key: "notifications.enabled", label: "Notificações habilitadas (master)", type: "bool" },
      { key: "notifications.push_enabled", label: "Push (Firebase)", type: "bool" },
      { key: "notifications.sms_enabled", label: "SMS", type: "bool" },
      { key: "notifications.whatsapp_enabled", label: "WhatsApp", type: "bool" },
      { key: "notifications.email_enabled", label: "E-mail", type: "bool" },
    ],
  },
  {
    id: "security",
    label: "Segurança",
    icon: Shield,
    description: "Resumo das políticas. Detalhes em Segurança.",
    fields: [],
  },
];

function AdminConfigPage() {
  const [map, setMap] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from("app_settings").select("key,value");
      if (!alive) return;
      if (error) toast.error(error.message);
      const m: Record<string, unknown> = {};
      for (const r of (data ?? []) as { key: string; value: unknown }[]) m[r.key] = r.value;
      setMap(m);
      setLoading(false);
    })();
    const ch = supabase
      .channel("admin-config-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, async () => {
        const { data } = await supabase.from("app_settings").select("key,value");
        const m: Record<string, unknown> = {};
        for (const r of (data ?? []) as { key: string; value: unknown }[]) m[r.key] = r.value;
        if (alive) setMap(m);
      })
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, []);

  function set(key: string, value: unknown) {
    setMap((m) => ({ ...m, [key]: value }));
  }

  async function saveSection(section: Section) {
    if (section.fields.length === 0) return;
    setSavingId(section.id);
    const { data: u } = await supabase.auth.getUser();
    const rows = section.fields.map((f) => ({
      key: f.key,
      value: (map[f.key] ?? (f.type === "bool" ? false : f.type === "number" ? 0 : "")) as never,
      updated_by: u?.user?.id ?? null,
    }));
    const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
    setSavingId(null);
    if (error) return toast.error(error.message);
    await logAdminAction({ action: "settings.update", entity: "app_settings", after: { section: section.id, keys: rows.length } });
    toast.success(`Seção "${section.label}" salva — aplicada em tempo real`);
  }

  const tabs = useMemo(() => SECTIONS, []);

  if (loading) {
    return (
      <AdminLayout title="Configurações">
        <div className="grid place-items-center py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Configurações da Plataforma"
      description="Mudanças propagam em tempo real para os apps do passageiro, do motorista e o painel."
    >
      <Tabs defaultValue={tabs[0].id} className="space-y-5">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/40 p-1">
          {tabs.map((s) => (
            <TabsTrigger key={s.id} value={s.id} className="gap-2 data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
              <s.icon className="h-3.5 w-3.5" />
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map((section) => (
          <TabsContent key={section.id} value={section.id} className="space-y-4">
            <Card className="border-border bg-card/60">
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <section.icon className="h-4 w-4 text-primary" />
                    {section.label}
                  </CardTitle>
                  <CardDescription className="text-xs">{section.description}</CardDescription>
                </div>
                {section.fields.length > 0 && (
                  <Button onClick={() => saveSection(section)} disabled={savingId === section.id} size="sm" className="gap-1">
                    {savingId === section.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Salvar
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {section.fields.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Acesse a seção dedicada no menu lateral para configurar este módulo.
                  </p>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {section.fields.map((f) => {
                      const raw = map[f.key];
                      if (f.type === "bool") {
                        return (
                          <label key={f.key} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background/40 p-3">
                            <div className="space-y-0.5">
                              <span className="text-sm font-medium">{f.label}</span>
                              {f.help && <p className="text-[11px] text-muted-foreground">{f.help}</p>}
                            </div>
                            <Switch checked={!!raw} onCheckedChange={(v) => set(f.key, v)} />
                          </label>
                        );
                      }
                      const display = raw == null
                        ? ""
                        : typeof raw === "object"
                          ? JSON.stringify(raw)
                          : String(raw).replace(/^"|"$/g, "");
                      return (
                        <label key={f.key} className="flex flex-col gap-1.5">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {f.label}
                          </span>
                          <Input
                            type={f.type === "number" ? "number" : "text"}
                            placeholder={f.placeholder}
                            value={display}
                            onChange={(e) =>
                              set(f.key, f.type === "number" ? Number(e.target.value) || 0 : e.target.value)
                            }
                          />
                          {f.help && <span className="text-[11px] text-muted-foreground/80">{f.help}</span>}
                        </label>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </AdminLayout>
  );
}
