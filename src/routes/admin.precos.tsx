import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2, Loader2 } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import {
  DSButton as Button,
  DSCard as Card,
  DSCardContent as CardContent,
  DSCardHeader as CardHeader,
  DSCardTitle as CardTitle,
  Loading,
} from "@/design-system";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { logAdminAction } from "@/lib/adminAudit";
import { upsertTariffRules, deleteTariffRule } from "@/lib/adminPricing.functions";

function mapAdminError(msg: string): string {
  if (msg === "forbidden") return "Ação restrita a administradores.";
  if (/invalid_|^Required$|uuid/i.test(msg)) return "Dados inválidos.";
  return msg;
}

export const Route = createFileRoute("/admin/precos")({
  head: () => ({ meta: [{ title: "Preços — Admin MOVVI" }] }),
  component: AdminPrecosPage,
});

type Rule = { id: string; category_key: string; field_key: string; value: number };
type Category = { key: string; label: string; enabled: boolean };

/** Campos canônicos por categoria (admin pode adicionar outros à vontade). */
const CANONICAL_FIELDS: Record<string, { key: string; label: string; hint?: string }[]> = {
  carros: [
    { key: "base_fare", label: "Bandeirada (R$)" },
    { key: "per_km", label: "Por km (R$)" },
    { key: "per_min", label: "Por minuto (R$)" },
    { key: "min_fare", label: "Tarifa mínima (R$)" },
    { key: "wait_per_min", label: "Espera por minuto (R$)" },
    { key: "free_waiting_min", label: "Espera grátis (min)" },
    { key: "peak_multiplier", label: "Multiplicador horário de pico" },
    { key: "night_multiplier", label: "Multiplicador noturno" },
    { key: "cancellation_fee", label: "Multa de cancelamento (R$)" },
    { key: "airport_fee", label: "Taxa aeroporto (R$)" },
    { key: "toll_fee", label: "Pedágio padrão (R$)" },
    { key: "extra_stop_fee", label: "Parada extra (R$)" },
  ],
  motos: [
    { key: "base_fare", label: "Bandeirada (R$)" },
    { key: "per_km", label: "Por km (R$)" },
    { key: "per_min", label: "Por minuto (R$)" },
    { key: "min_fare", label: "Tarifa mínima (R$)" },
    { key: "wait_per_min", label: "Espera por minuto (R$)" },
    { key: "peak_multiplier", label: "Multiplicador horário de pico" },
    { key: "cancellation_fee", label: "Multa de cancelamento (R$)" },
  ],
  fretes: [
    { key: "base_fare", label: "Bandeirada (R$)" },
    { key: "per_km", label: "Por km (R$)" },
    { key: "per_min", label: "Por minuto (R$)" },
    { key: "min_fare", label: "Tarifa mínima (R$)" },
    { key: "wait_per_min", label: "Espera por minuto (R$)" },
    { key: "extra_stop_fee", label: "Parada extra (R$)" },
    { key: "max_weight_kg", label: "Peso máximo (kg)" },
  ],
  guincho: [
    { key: "call_out_fee", label: "Chamada (R$)" },
    { key: "per_km", label: "Por km (R$)" },
    { key: "heavy_vehicle_fee", label: "Veículo pesado (R$)" },
    { key: "night_fee", label: "Adicional noturno (R$)" },
    { key: "difficult_access_fee", label: "Acesso difícil (R$)" },
    { key: "toll_fee", label: "Pedágio padrão (R$)" },
  ],
  envios: [
    { key: "base_fare", label: "Bandeirada (R$)" },
    { key: "per_km", label: "Por km (R$)" },
    { key: "hourly_rate", label: "Hora trabalhada (R$)" },
    { key: "helper1_fee", label: "1 ajudante (R$)" },
    { key: "helper2_fee", label: "2 ajudantes (R$)" },
    { key: "stair_fee", label: "Por andar sem elevador (R$)" },
    { key: "heavy_furniture_fee", label: "Móvel pesado (R$)" },
  ],
};

function AdminPrecosPage() {
  const upsertFn = useServerFn(upsertTariffRules);
  const deleteFn = useServerFn(deleteTariffRule);
  const [cats, setCats] = useState<Category[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [activeCat, setActiveCat] = useState<string>("");

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const [cRes, rRes] = await Promise.all([
        supabase.from("ride_categories").select("key,label,enabled").order("sort_order"),
        supabase.from("tariff_rules").select("id,category_key,field_key,value"),
      ]);
      if (!alive) return;
      if (cRes.error) toast.error("Categorias: " + cRes.error.message);
      if (rRes.error) toast.error("Regras: " + rRes.error.message);
      const categories = (cRes.data ?? []) as Category[];
      setCats(categories);
      setRules(((rRes.data ?? []) as Rule[]).map((r) => ({ ...r, value: Number(r.value) })));
      setActiveCat((prev) => prev || categories[0]?.key || "");
      setLoading(false);
    };
    refresh();
    const channel = supabase
      .channel("admin-tariffs")
      .on("postgres_changes", { event: "*", schema: "public", table: "tariff_rules" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "ride_categories" }, refresh)
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const ruleMap = useMemo(() => {
    const m: Record<string, Record<string, Rule>> = {};
    for (const r of rules) {
      (m[r.category_key] ??= {})[r.field_key] = r;
    }
    return m;
  }, [rules]);

  function setLocalValue(category: string, field: string, value: number) {
    setRules((rs) => {
      const idx = rs.findIndex((r) => r.category_key === category && r.field_key === field);
      if (idx >= 0) {
        const copy = [...rs];
        copy[idx] = { ...copy[idx], value };
        return copy;
      }
      return [...rs, { id: `new-${category}-${field}`, category_key: category, field_key: field, value }];
    });
  }

  async function saveCategory(category: string) {
    setBusy(true);
    const dirty = rules.filter((r) => r.category_key === category);
    const payload = dirty.map((r) => ({
      category_key: r.category_key,
      field_key: r.field_key,
      value: Number(r.value) || 0,
    }));
    try {
      await upsertFn({ data: { rows: payload } });
      await logAdminAction({
        action: "tariff_rules.upsert",
        entity: "tariff_rules",
        after: { category, count: payload.length },
      });
      toast.success(`Tarifas de "${category}" salvas — refletindo no app em tempo real`);
    } catch (e) {
      toast.error(
        "Erro ao salvar: " + (e instanceof Error ? mapAdminError(e.message) : String(e)),
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteRule(rule: Rule) {
    if (rule.id.startsWith("new-")) {
      setRules((rs) => rs.filter((r) => r !== rule));
      return;
    }
    if (!confirm(`Excluir o campo "${rule.field_key}"?`)) return;
    try {
      await deleteFn({ data: { id: rule.id } });
      await logAdminAction({
        action: "tariff_rules.delete",
        entity: "tariff_rules",
        entity_id: rule.id,
      });
    } catch (e) {
      toast.error(e instanceof Error ? mapAdminError(e.message) : String(e));
    }
  }

  async function addCustomField(category: string) {
    const key = prompt("Nome técnico do campo (ex: holiday_surcharge):")?.trim();
    if (!key) return;
    const valStr = prompt("Valor numérico:");
    const value = Number(valStr);
    if (!Number.isFinite(value)) {
      toast.error("Valor inválido");
      return;
    }
    try {
      await upsertFn({
        data: { rows: [{ category_key: category, field_key: key, value }] },
      });
      await logAdminAction({
        action: "tariff_rules.add_field",
        entity: "tariff_rules",
        after: { category, field: key },
      });
      toast.success("Campo adicionado");
    } catch (e) {
      toast.error(e instanceof Error ? mapAdminError(e.message) : String(e));
    }
  }

  return (
    <AdminLayout
      title="Preços e Tarifas"
      description="Defina todas as regras de precificação por categoria. Alterações refletem no app do passageiro instantaneamente."
    >
      {loading ? (
        <div className="grid place-items-center py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <Tabs value={activeCat} onValueChange={setActiveCat} className="space-y-4">
          <TabsList className="flex flex-wrap gap-1">
            {cats.map((c) => (
              <TabsTrigger key={c.key} value={c.key} className="capitalize">
                {c.label}
                {!c.enabled && <span className="ml-1 text-[10px] text-muted-foreground">(off)</span>}
              </TabsTrigger>
            ))}
          </TabsList>

          {cats.map((c) => {
            const canonical = CANONICAL_FIELDS[c.key] ?? [];
            const dbRules = ruleMap[c.key] ?? {};
            const canonicalKeys = new Set(canonical.map((f) => f.key));
            const extras = Object.values(dbRules).filter((r) => !canonicalKeys.has(r.field_key));

            return (
              <TabsContent key={c.key} value={c.key} className="space-y-4">
                <Card className="border-border bg-card/60">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base">Regras canônicas</CardTitle>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => addCustomField(c.key)} className="gap-1">
                        <Plus className="h-3 w-3" /> Campo
                      </Button>
                      <Button size="sm" onClick={() => saveCategory(c.key)} disabled={busy} className="gap-1">
                        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        Salvar tudo
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {canonical.map((f) => {
                      const rule = dbRules[f.key];
                      const value = rule?.value ?? 0;
                      return (
                        <label key={f.key} className="flex flex-col gap-1">
                          <span className="text-[11px] font-semibold text-muted-foreground">{f.label}</span>
                          <Input
                            type="number"
                            step="0.01"
                            value={value}
                            onChange={(e) => setLocalValue(c.key, f.key, Number(e.target.value) || 0)}
                          />
                          <span className="text-[10px] text-muted-foreground/70">{f.key}</span>
                        </label>
                      );
                    })}
                  </CardContent>
                </Card>

                {extras.length > 0 && (
                  <Card className="border-border bg-card/60">
                    <CardHeader>
                      <CardTitle className="text-base">Campos personalizados</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {extras.map((r) => (
                        <div key={r.field_key} className="flex flex-col gap-1">
                          <span className="text-[11px] font-semibold text-muted-foreground">{r.field_key}</span>
                          <div className="flex gap-1">
                            <Input
                              type="number"
                              step="0.01"
                              value={r.value}
                              onChange={(e) => setLocalValue(c.key, r.field_key, Number(e.target.value) || 0)}
                            />
                            <Button size="icon" variant="ghost" onClick={() => deleteRule(r)} className="text-destructive">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </AdminLayout>
  );
}
