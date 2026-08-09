/* eslint-disable @typescript-eslint/no-explicit-any -- Temporary Phase 8 bridge until generated Supabase types include canonical admin RPCs. */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, ShieldCheck } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { upsertAdminTariffRule, type AdminTariffInput } from "@/lib/adminControlPlane";

export const Route = createFileRoute("/admin/precos")({
  head: () => ({ meta: [{ title: "Tarifas — Admin APOIS" }] }),
  component: AdminPrecosPage,
});

type Category = {
  id: string;
  code: "carros" | "motos" | "fretes" | "guincho" | "envios";
  name: string;
  is_active: boolean;
};

type TariffRow = {
  id?: string;
  category_id: string;
  city: string;
  base_fare: number;
  min_fare: number;
  per_km: number;
  per_min: number;
  stop_fee: number;
  fixed_fee: number;
  dynamic_multiplier: number;
  helper1_fee: number;
  helper2_fee: number;
  heavy_furniture_fee: number;
  assembly_fee: number;
  packing_fee: number;
  difficult_access_fee: number;
  stair_fee: number;
  heavy_vehicle_fee: number;
  accident_fee: number;
  platform_fee: number;
  locked_wheels_fee: number;
  garage_fee: number;
  max_weight_kg: number;
  per_kg: number;
  is_active: boolean;
};

type NumericKey = Exclude<keyof TariffRow, "id" | "category_id" | "city" | "is_active">;

const DEFAULT_TARIFF: Omit<TariffRow, "category_id"> = {
  city: "default",
  base_fare: 0,
  min_fare: 0,
  per_km: 0,
  per_min: 0,
  stop_fee: 0,
  fixed_fee: 0,
  dynamic_multiplier: 1,
  helper1_fee: 0,
  helper2_fee: 0,
  heavy_furniture_fee: 0,
  assembly_fee: 0,
  packing_fee: 0,
  difficult_access_fee: 0,
  stair_fee: 0,
  heavy_vehicle_fee: 0,
  accident_fee: 0,
  platform_fee: 0,
  locked_wheels_fee: 0,
  garage_fee: 0,
  max_weight_kg: 0,
  per_kg: 0,
  is_active: true,
};

const COMMON_FIELDS: Array<[NumericKey, string]> = [
  ["base_fare", "Bandeirada / chamada (R$)"],
  ["min_fare", "Tarifa mínima (R$)"],
  ["per_km", "Por km (R$)"],
  ["per_min", "Por minuto (R$)"],
  ["stop_fee", "Parada adicional (R$)"],
  ["fixed_fee", "Taxa fixa da categoria (R$)"],
  ["dynamic_multiplier", "Multiplicador dinâmico"],
];

const EXTRA_FIELDS: Record<Category["code"], Array<[NumericKey, string]>> = {
  carros: [],
  motos: [],
  fretes: [
    ["helper1_fee", "1 ajudante (R$)"],
    ["helper2_fee", "2 ajudantes (R$)"],
    ["heavy_furniture_fee", "Item pesado (R$)"],
    ["assembly_fee", "Montagem/desmontagem (R$)"],
    ["packing_fee", "Embalagem (R$)"],
    ["difficult_access_fee", "Acesso difícil (R$)"],
    ["stair_fee", "Escadas por andar (R$)"],
  ],
  guincho: [
    ["heavy_vehicle_fee", "Veículo pesado (R$)"],
    ["difficult_access_fee", "Acesso difícil (R$)"],
    ["accident_fee", "Veículo acidentado (R$)"],
    ["platform_fee", "Adicional por plataforma do guincho (R$)"],
    ["locked_wheels_fee", "Rodas travadas (R$)"],
    ["garage_fee", "Garagem/subsolo (R$)"],
  ],
  envios: [
    ["max_weight_kg", "Peso máximo (kg)"],
    ["per_kg", "Por kg (R$)"],
  ],
};

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeTariff(row: Record<string, unknown>, categoryId: string): TariffRow {
  return {
    id: typeof row.id === "string" ? row.id : undefined,
    category_id: categoryId,
    city: String(row.city ?? "default"),
    base_fare: asNumber(row.base_fare),
    min_fare: asNumber(row.min_fare),
    per_km: asNumber(row.per_km),
    per_min: asNumber(row.per_min),
    stop_fee: asNumber(row.stop_fee),
    fixed_fee: asNumber(row.fixed_fee),
    dynamic_multiplier: asNumber(row.dynamic_multiplier, 1) || 1,
    helper1_fee: asNumber(row.helper1_fee),
    helper2_fee: asNumber(row.helper2_fee),
    heavy_furniture_fee: asNumber(row.heavy_furniture_fee),
    assembly_fee: asNumber(row.assembly_fee),
    packing_fee: asNumber(row.packing_fee),
    difficult_access_fee: asNumber(row.difficult_access_fee),
    stair_fee: asNumber(row.stair_fee),
    heavy_vehicle_fee: asNumber(row.heavy_vehicle_fee),
    accident_fee: asNumber(row.accident_fee),
    platform_fee: asNumber(row.platform_fee),
    locked_wheels_fee: asNumber(row.locked_wheels_fee),
    garage_fee: asNumber(row.garage_fee),
    max_weight_kg: asNumber(row.max_weight_kg),
    per_kg: asNumber(row.per_kg),
    is_active: row.is_active !== false,
  };
}

function AdminPrecosPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tariffs, setTariffs] = useState<Record<string, TariffRow>>({});
  const [activeCode, setActiveCode] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [savingCode, setSavingCode] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const db = supabase as any;
      const [categoryResult, tariffResult] = await Promise.all([
        db
          .from("ride_categories")
          .select("id,code,name,is_active")
          .order("sort_order", { ascending: true }),
        db.from("tariff_rules").select("*").order("city", { ascending: true }),
      ]);
      if (!alive) return;
      if (categoryResult.error) {
        toast.error("Categorias: " + categoryResult.error.message);
        setLoading(false);
        return;
      }
      if (tariffResult.error) {
        toast.error("Tarifas: " + tariffResult.error.message);
        setLoading(false);
        return;
      }

      const nextCategories = (categoryResult.data ?? []) as Category[];
      const byCategory: Record<string, TariffRow> = {};
      for (const category of nextCategories) {
        const existing = (tariffResult.data ?? []).find(
          (row: Record<string, unknown>) =>
            row.category_id === category.id && String(row.city ?? "default") === "default",
        );
        byCategory[category.code] = existing
          ? normalizeTariff(existing as Record<string, unknown>, category.id)
          : { ...DEFAULT_TARIFF, category_id: category.id };
      }
      setCategories(nextCategories);
      setTariffs(byCategory);
      setActiveCode((current) => current || nextCategories[0]?.code || "");
      setLoading(false);
    };

    void refresh();
    const channel = supabase
      .channel("admin-tariffs-canonical")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tariff_rules" },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      alive = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.code, category])),
    [categories],
  );

  function patch(code: string, next: Partial<TariffRow>) {
    setTariffs((current) => ({
      ...current,
      [code]: { ...current[code], ...next },
    }));
  }

  async function save(code: Category["code"]) {
    const row = tariffs[code];
    if (!row) return;
    setSavingCode(code);
    try {
      const input: AdminTariffInput = {
        categoryCode: code,
        city: row.city || "default",
        baseFare: row.base_fare,
        minFare: row.min_fare,
        perKm: row.per_km,
        perMin: row.per_min,
        stopFee: row.stop_fee,
        fixedFee: row.fixed_fee,
        dynamicMultiplier: row.dynamic_multiplier,
        helper1Fee: row.helper1_fee,
        helper2Fee: row.helper2_fee,
        heavyFurnitureFee: row.heavy_furniture_fee,
        assemblyFee: row.assembly_fee,
        packingFee: row.packing_fee,
        difficultAccessFee: row.difficult_access_fee,
        stairFee: row.stair_fee,
        heavyVehicleFee: row.heavy_vehicle_fee,
        accidentFee: row.accident_fee,
        platformFee: row.platform_fee,
        lockedWheelsFee: row.locked_wheels_fee,
        garageFee: row.garage_fee,
        maxWeightKg: row.max_weight_kg,
        perKg: row.per_kg,
        isActive: row.is_active,
      };
      await upsertAdminTariffRule(input);
      toast.success(`Tarifa de ${categoryMap.get(code)?.name ?? code} salva no modelo canônico.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a tarifa.");
    } finally {
      setSavingCode(null);
    }
  }

  return (
    <AdminLayout
      title="Preços e Tarifas"
      description="Edite os parâmetros consumidos pelo Fare Engine server-side. O painel não calcula o preço final da corrida."
    >
      {loading ? (
        <Loading label="Carregando tarifas..." />
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p>
              O valor exibido ao passageiro continua sendo calculado pelo backend. Esta tela apenas
              administra os parâmetros tipados da tarifa; não existem campos livres de preço.
            </p>
          </div>

          <Tabs value={activeCode} onValueChange={setActiveCode} className="space-y-4">
            <TabsList className="flex flex-wrap gap-1">
              {categories.map((category) => (
                <TabsTrigger key={category.code} value={category.code}>
                  {category.name}
                  {!category.is_active ? " (categoria off)" : ""}
                </TabsTrigger>
              ))}
            </TabsList>

            {categories.map((category) => {
              const row = tariffs[category.code];
              if (!row) return null;
              const fields = [...COMMON_FIELDS, ...EXTRA_FIELDS[category.code]];
              return (
                <TabsContent key={category.code} value={category.code} className="space-y-4">
                  <Card className="border-border bg-card/60">
                    <CardHeader className="flex flex-row items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">{category.name}</CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Regra: {category.code} · cidade: {row.city}
                        </p>
                      </div>
                      <label className="flex items-center gap-2 text-xs font-medium">
                        <Switch
                          checked={row.is_active}
                          onCheckedChange={(value) => patch(category.code, { is_active: value })}
                        />
                        {row.is_active ? "Tarifa ativa" : "Tarifa desativada"}
                      </label>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {fields.map(([key, label]) => (
                          <Field key={key} label={label} technical={key}>
                            <DSInput
                              type="number"
                              min={key === "dynamic_multiplier" ? 0.001 : 0}
                              step={key === "dynamic_multiplier" ? 0.01 : 0.01}
                              value={row[key]}
                              onChange={(event) =>
                                patch(category.code, {
                                  [key]:
                                    Number(event.target.value) ||
                                    (key === "dynamic_multiplier" ? 1 : 0),
                                } as Partial<TariffRow>)
                              }
                            />
                          </Field>
                        ))}
                      </div>

                      <div className="flex justify-end">
                        <Button
                          onClick={() => void save(category.code)}
                          disabled={savingCode === category.code}
                          className="gap-2"
                        >
                          {savingCode === category.code ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                          Salvar tarifa
                        </Button>
                      </div>
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

function Field({
  label,
  technical,
  children,
}: {
  label: string;
  technical: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
      {children}
      <span className="font-mono text-[9px] text-muted-foreground/60">{technical}</span>
    </label>
  );
}
