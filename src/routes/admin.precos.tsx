import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import {
  DSButton as Button,
  DSCard as Card,
  DSCardContent as CardContent,
  DSCardHeader as CardHeader,
  DSCardTitle as CardTitle,
  DSInput,
  Loading,
} from "@/design-system";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { upsertTariffRule } from "@/lib/adminPricing.functions";

export const Route = createFileRoute("/admin/precos")({
  head: () => ({ meta: [{ title: "Preços — Admin APOIS" }] }),
  component: AdminPrecosPage,
});

type Category = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  sort_order: number;
};

type TariffField =
  | "base_fare"
  | "min_fare"
  | "per_km"
  | "per_min"
  | "stop_fee"
  | "fixed_fee"
  | "dynamic_multiplier"
  | "helper1_fee"
  | "helper2_fee"
  | "heavy_furniture_fee"
  | "assembly_fee"
  | "packing_fee"
  | "difficult_access_fee"
  | "stair_fee"
  | "heavy_vehicle_fee"
  | "accident_fee"
  | "platform_fee"
  | "locked_wheels_fee"
  | "garage_fee"
  | "max_weight_kg"
  | "per_kg";

type TariffRule = Record<TariffField, number> & {
  id: string;
  category_id: string;
  city: string;
  is_active: boolean;
};

type FieldDefinition = {
  key: TariffField;
  label: string;
  step?: string;
  hint?: string;
};

const COMMON_FIELDS: FieldDefinition[] = [
  { key: "base_fare", label: "Valor base (R$)", step: "0.01" },
  { key: "min_fare", label: "Tarifa mínima (R$)", step: "0.01" },
  { key: "per_km", label: "Por km (R$)", step: "0.01" },
  { key: "per_min", label: "Por minuto (R$)", step: "0.01" },
  { key: "stop_fee", label: "Parada adicional (R$)", step: "0.01" },
  { key: "fixed_fee", label: "Taxa fixa (R$)", step: "0.01" },
  {
    key: "dynamic_multiplier",
    label: "Multiplicador de demanda",
    step: "0.001",
    hint: "1 = sem ajuste dinâmico",
  },
];

const EXTRA_FIELDS: Partial<Record<string, FieldDefinition[]>> = {
  fretes: [
    { key: "helper1_fee", label: "1 ajudante (R$)", step: "0.01" },
    { key: "helper2_fee", label: "2 ajudantes (R$)", step: "0.01" },
    { key: "heavy_furniture_fee", label: "Item pesado (R$)", step: "0.01" },
    { key: "assembly_fee", label: "Montagem/desmontagem (R$)", step: "0.01" },
    { key: "packing_fee", label: "Embalagem (R$)", step: "0.01" },
    { key: "difficult_access_fee", label: "Acesso difícil (R$)", step: "0.01" },
    { key: "stair_fee", label: "Por andar sem elevador (R$)", step: "0.01" },
  ],
  guincho: [
    { key: "heavy_vehicle_fee", label: "Veículo pesado (R$)", step: "0.01" },
    { key: "difficult_access_fee", label: "Acesso difícil (R$)", step: "0.01" },
    { key: "accident_fee", label: "Veículo acidentado (R$)", step: "0.01" },
    { key: "platform_fee", label: "Plataforma do guincho (R$)", step: "0.01" },
    { key: "locked_wheels_fee", label: "Rodas travadas (R$)", step: "0.01" },
    { key: "garage_fee", label: "Garagem/subsolo (R$)", step: "0.01" },
  ],
  envios: [
    { key: "max_weight_kg", label: "Peso máximo (kg)", step: "0.01" },
    { key: "per_kg", label: "Por kg (R$)", step: "0.01" },
  ],
};

const TARIFF_SELECT = [
  "id",
  "category_id",
  "city",
  "is_active",
  "base_fare",
  "min_fare",
  "per_km",
  "per_min",
  "stop_fee",
  "fixed_fee",
  "dynamic_multiplier",
  "helper1_fee",
  "helper2_fee",
  "heavy_furniture_fee",
  "assembly_fee",
  "packing_fee",
  "difficult_access_fee",
  "stair_fee",
  "heavy_vehicle_fee",
  "accident_fee",
  "platform_fee",
  "locked_wheels_fee",
  "garage_fee",
  "max_weight_kg",
  "per_kg",
].join(",");

const NUMERIC_FIELDS: TariffField[] = [
  "base_fare",
  "min_fare",
  "per_km",
  "per_min",
  "stop_fee",
  "fixed_fee",
  "dynamic_multiplier",
  "helper1_fee",
  "helper2_fee",
  "heavy_furniture_fee",
  "assembly_fee",
  "packing_fee",
  "difficult_access_fee",
  "stair_fee",
  "heavy_vehicle_fee",
  "accident_fee",
  "platform_fee",
  "locked_wheels_fee",
  "garage_fee",
  "max_weight_kg",
  "per_kg",
];

function normalizeRule(raw: Record<string, unknown>): TariffRule {
  const normalized = {
    id: String(raw.id ?? ""),
    category_id: String(raw.category_id ?? ""),
    city: String(raw.city ?? "default"),
    is_active: raw.is_active !== false,
  } as TariffRule;

  for (const field of NUMERIC_FIELDS) {
    const value = Number(raw[field] ?? (field === "dynamic_multiplier" ? 1 : 0));
    normalized[field] = Number.isFinite(value) ? value : field === "dynamic_multiplier" ? 1 : 0;
  }
  return normalized;
}

function emptyRule(categoryId: string): TariffRule {
  return normalizeRule({ id: "", category_id: categoryId, city: "default", is_active: true });
}

function mapAdminError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "forbidden") return "Ação restrita a administradores autorizados.";
  if (message === "admin_authorization_failed") return "Não foi possível validar a permissão administrativa.";
  if (message === "pricing_backend_not_deployed") {
    return "O contrato canônico de tarifas ainda não está publicado neste ambiente. Nenhuma tarifa foi alterada.";
  }
  if (/invalid_|check constraint|numeric/i.test(message)) return "Há um valor de tarifa inválido.";
  return message;
}

function AdminPrecosPage() {
  const saveFn = useServerFn(upsertTariffRule);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rules, setRules] = useState<TariffRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyCategoryId, setBusyCategoryId] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState("");

  useEffect(() => {
    let alive = true;
    const db = supabase as any;

    const refresh = async () => {
      const [categoryResult, tariffResult] = await Promise.all([
        db
          .from("ride_categories")
          .select("id,code,name,is_active,sort_order")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        db
          .from("tariff_rules")
          .select(TARIFF_SELECT)
          .eq("city", "default")
          .eq("is_active", true),
      ]);

      if (!alive) return;
      if (categoryResult.error) toast.error("Categorias: " + categoryResult.error.message);
      if (tariffResult.error) toast.error("Tarifas: " + tariffResult.error.message);

      const nextCategories = ((categoryResult.data ?? []) as Category[]).filter(Boolean);
      const nextRules = ((tariffResult.data ?? []) as Record<string, unknown>[]).map(normalizeRule);
      setCategories(nextCategories);
      setRules(nextRules);
      setActiveCategoryId((current) => current || nextCategories[0]?.id || "");
      setLoading(false);
    };

    refresh();
    const channel = supabase
      .channel("admin-canonical-tariffs")
      .on("postgres_changes", { event: "*", schema: "public", table: "tariff_rules" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "ride_categories" }, refresh)
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const ruleByCategory = useMemo(() => {
    const map = new Map<string, TariffRule>();
    for (const rule of rules) map.set(rule.category_id, rule);
    return map;
  }, [rules]);

  function updateLocal(categoryId: string, field: TariffField, value: number) {
    setRules((current) => {
      const index = current.findIndex((rule) => rule.category_id === categoryId);
      if (index < 0) {
        const created = emptyRule(categoryId);
        created[field] = value;
        return [...current, created];
      }
      const copy = [...current];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  }

  async function saveCategory(category: Category) {
    const rule = ruleByCategory.get(category.id) ?? emptyRule(category.id);
    const fields = [...COMMON_FIELDS, ...(EXTRA_FIELDS[category.code] ?? [])];
    const patch = Object.fromEntries(fields.map(({ key }) => [key, rule[key]]));

    if (Number(patch.dynamic_multiplier) <= 0) {
      toast.error("O multiplicador de demanda precisa ser maior que zero.");
      return;
    }

    setBusyCategoryId(category.id);
    try {
      const result = await saveFn({
        data: {
          category_id: category.id,
          city: "default",
          patch,
        },
      });
      const saved = result?.rule;
      if (saved && typeof saved === "object") {
        const normalized = normalizeRule(saved as Record<string, unknown>);
        setRules((current) => [
          ...current.filter((item) => item.category_id !== category.id),
          normalized,
        ]);
      }
      toast.success(`Tarifas de ${category.name} salvas com auditoria server-side.`);
    } catch (error) {
      toast.error(mapAdminError(error));
    } finally {
      setBusyCategoryId(null);
    }
  }

  return (
    <AdminLayout
      title="Preços e Tarifas"
      description="Edite a tarifa canônica usada pelo backend do APOIS Corridas."
    >
      {loading ? (
        <Loading label="Carregando preços..." />
      ) : categories.length === 0 ? (
        <Card className="border-border bg-card/60">
          <CardContent className="py-8 text-sm text-muted-foreground">
            Nenhuma categoria ativa foi encontrada no Supabase oficial.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="border-border bg-card/60">
            <CardContent className="py-4 text-sm text-muted-foreground">
              Esta tela trabalha somente com o contrato vigente de <code>tariff_rules</code> e com a região
              <code className="mx-1">default</code>, que é a tarifa de fallback atualmente usada na solicitação de corrida.
              Campos arbitrários do modelo antigo não são mais gravados.
            </CardContent>
          </Card>

          <Tabs value={activeCategoryId} onValueChange={setActiveCategoryId} className="space-y-4">
            <TabsList className="flex flex-wrap gap-1">
              {categories.map((category) => (
                <TabsTrigger key={category.id} value={category.id}>
                  {category.name}
                </TabsTrigger>
              ))}
            </TabsList>

            {categories.map((category) => {
              const rule = ruleByCategory.get(category.id) ?? emptyRule(category.id);
              const fields = [...COMMON_FIELDS, ...(EXTRA_FIELDS[category.code] ?? [])];
              const saving = busyCategoryId === category.id;

              return (
                <TabsContent key={category.id} value={category.id} className="space-y-4">
                  <Card className="border-border bg-card/60">
                    <CardHeader className="flex flex-row items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">{category.name}</CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Código: {category.code} • Região: default
                        </p>
                      </div>
                      <Button
                        size="sm"
                        className="gap-1"
                        disabled={saving || busyCategoryId !== null}
                        onClick={() => saveCategory(category)}
                      >
                        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        Salvar
                      </Button>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {fields.map((field) => (
                        <label key={field.key} className="flex flex-col gap-1">
                          <span className="text-[11px] font-semibold text-muted-foreground">{field.label}</span>
                          <DSInput
                            type="number"
                            min={field.key === "dynamic_multiplier" ? "0.001" : "0"}
                            step={field.step ?? "0.01"}
                            value={rule[field.key]}
                            onChange={(event) => {
                              const parsed = Number(event.target.value);
                              updateLocal(
                                category.id,
                                field.key,
                                Number.isFinite(parsed) ? Math.max(0, parsed) : 0,
                              );
                            }}
                          />
                          <span className="text-[10px] text-muted-foreground/70">
                            {field.key}{field.hint ? ` • ${field.hint}` : ""}
                          </span>
                        </label>
                      ))}
                    </CardContent>
                  </Card>
                </TabsContent>
              );
            })}
          </Tabs>
        </div>
      )}
    </AdminLayout>
  );
}
