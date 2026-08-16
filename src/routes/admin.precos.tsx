/* eslint-disable @typescript-eslint/no-explicit-any -- Temporary Phase 8 bridge until generated Supabase types include canonical admin RPCs. */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, Save, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import {
  DSButton as Button,
  DSCard as Card,
  DSCardContent as CardContent,
  DSCardHeader as CardHeader,
  DSCardTitle as CardTitle,
  DSInput,
  EmptyState,
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

type CategoryCode = "carros" | "motos" | "fretes" | "guincho" | "envios";

type Category = {
  id: string;
  code: CategoryCode;
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
type DraftMap = Record<string, Partial<Record<NumericKey, string>>>;

const CATEGORY_CODES: CategoryCode[] = ["carros", "motos", "fretes", "guincho", "envios"];
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

const EXTRA_FIELDS: Record<CategoryCode, Array<[NumericKey, string]>> = {
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

function cleanText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text || fallback;
}

function isCategoryCode(value: unknown): value is CategoryCode {
  return CATEGORY_CODES.includes(cleanText(value).toLowerCase() as CategoryCode);
}

function asNonNegativeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function asMultiplier(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0.001 && parsed <= 100 ? parsed : 1;
}

function normalizeTariff(row: Record<string, unknown>, categoryId: string): TariffRow {
  return {
    id: cleanText(row.id) || undefined,
    category_id: categoryId,
    city: cleanText(row.city, "default").toLowerCase().slice(0, 120),
    base_fare: asNonNegativeNumber(row.base_fare),
    min_fare: asNonNegativeNumber(row.min_fare),
    per_km: asNonNegativeNumber(row.per_km),
    per_min: asNonNegativeNumber(row.per_min),
    stop_fee: asNonNegativeNumber(row.stop_fee),
    fixed_fee: asNonNegativeNumber(row.fixed_fee),
    dynamic_multiplier: asMultiplier(row.dynamic_multiplier),
    helper1_fee: asNonNegativeNumber(row.helper1_fee),
    helper2_fee: asNonNegativeNumber(row.helper2_fee),
    heavy_furniture_fee: asNonNegativeNumber(row.heavy_furniture_fee),
    assembly_fee: asNonNegativeNumber(row.assembly_fee),
    packing_fee: asNonNegativeNumber(row.packing_fee),
    difficult_access_fee: asNonNegativeNumber(row.difficult_access_fee),
    stair_fee: asNonNegativeNumber(row.stair_fee),
    heavy_vehicle_fee: asNonNegativeNumber(row.heavy_vehicle_fee),
    accident_fee: asNonNegativeNumber(row.accident_fee),
    platform_fee: asNonNegativeNumber(row.platform_fee),
    locked_wheels_fee: asNonNegativeNumber(row.locked_wheels_fee),
    garage_fee: asNonNegativeNumber(row.garage_fee),
    max_weight_kg: asNonNegativeNumber(row.max_weight_kg),
    per_kg: asNonNegativeNumber(row.per_kg),
    is_active: row.is_active !== false,
  };
}

function parseDraftValue(key: NumericKey, raw: string): { value?: number; error?: string } {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) return { error: "Preencha todos os valores da tarifa antes de salvar." };
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return { error: "Há um valor numérico inválido na tarifa." };
  if (parsed < 0) return { error: "Os valores da tarifa não podem ser negativos." };
  if (key === "dynamic_multiplier" && (parsed < 0.001 || parsed > 100)) {
    return { error: "O multiplicador dinâmico deve ficar entre 0,001 e 100." };
  }
  return { value: parsed };
}

function validateRow(row: TariffRow) {
  const numericKeys = Object.keys(DEFAULT_TARIFF).filter(
    (key): key is NumericKey => key !== "city" && key !== "is_active",
  );
  for (const key of numericKeys) {
    const value = row[key];
    if (!Number.isFinite(value) || value < 0) return "Há um valor numérico inválido na tarifa.";
  }
  if (row.dynamic_multiplier < 0.001 || row.dynamic_multiplier > 100) {
    return "O multiplicador dinâmico deve ficar entre 0,001 e 100.";
  }
  if (!cleanText(row.category_id)) return "Categoria inválida.";
  if (!cleanText(row.city)) return "Cidade/regra da tarifa inválida.";
  return null;
}

function AdminPrecosPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tariffs, setTariffs] = useState<Record<string, TariffRow>>({});
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [dirtyCodes, setDirtyCodes] = useState<Set<string>>(new Set());
  const [activeCode, setActiveCode] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const requestRef = useRef(0);
  const dirtyRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    dirtyRef.current = dirtyCodes;
  }, [dirtyCodes]);

  useEffect(() => {
    let alive = true;
    let refreshTimer: number | null = null;

    const refresh = async () => {
      const requestId = ++requestRef.current;
      setLoading(true);
      setLoadError(null);
      const db = supabase as any;
      try {
        const [categoryResult, tariffResult] = await Promise.all([
          db
            .from("ride_categories")
            .select("id,code,name,is_active")
            .order("sort_order", { ascending: true }),
          db.from("tariff_rules").select("*").order("city", { ascending: true }),
        ]);
        if (!alive || requestId !== requestRef.current) return;
        if (categoryResult.error) throw categoryResult.error;
        if (tariffResult.error) throw tariffResult.error;

        const seenCodes = new Set<CategoryCode>();
        const seenIds = new Set<string>();
        const nextCategories = ((categoryResult.data ?? []) as Array<Record<string, unknown>>)
          .filter((row) => Boolean(cleanText(row.id)) && isCategoryCode(row.code))
          .map((row) => ({
            id: cleanText(row.id),
            code: cleanText(row.code).toLowerCase() as CategoryCode,
            name: cleanText(row.name, cleanText(row.code)).slice(0, 100),
            is_active: row.is_active !== false,
          }))
          .filter((category) => {
            if (seenCodes.has(category.code) || seenIds.has(category.id)) return false;
            seenCodes.add(category.code);
            seenIds.add(category.id);
            return true;
          });

        const byCategory: Record<string, TariffRow> = {};
        for (const category of nextCategories) {
          const existing = (tariffResult.data ?? []).find(
            (row: Record<string, unknown>) =>
              cleanText(row.category_id) === category.id &&
              cleanText(row.city, "default").toLowerCase() === "default",
          );
          byCategory[category.code] = existing
            ? normalizeTariff(existing as Record<string, unknown>, category.id)
            : { ...DEFAULT_TARIFF, category_id: category.id };
        }

        setCategories(nextCategories);
        setTariffs((current) => {
          const merged = { ...byCategory };
          for (const code of dirtyRef.current) {
            if (current[code]) merged[code] = current[code];
          }
          return merged;
        });
        setDrafts((current) => {
          const next = { ...current };
          for (const code of Object.keys(byCategory)) {
            if (!dirtyRef.current.has(code)) delete next[code];
          }
          return next;
        });
        setActiveCode((current) =>
          nextCategories.some((category) => category.code === current)
            ? current
            : nextCategories[0]?.code ?? "",
        );
      } catch (error) {
        if (!alive || requestId !== requestRef.current) return;
        setLoadError("Não foi possível carregar as tarifas agora. Tente novamente.");
        if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao carregar tarifas", error);
      } finally {
        if (alive && requestId === requestRef.current) setLoading(false);
      }
    };

    const scheduleRefresh = () => {
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void refresh(), 250);
    };

    void refresh();
    const channel = supabase
      .channel("admin-tariffs-canonical")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tariff_rules" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ride_categories" },
        scheduleRefresh,
      )
      .subscribe();
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      requestRef.current += 1;
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [reloadNonce]);

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.code, category])),
    [categories],
  );

  function markDirty(code: string) {
    dirtyRef.current = new Set(dirtyRef.current).add(code);
    setDirtyCodes(new Set(dirtyRef.current));
    setSaveError(null);
  }

  function patch(code: string, next: Partial<TariffRow>) {
    setTariffs((current) => {
      const row = current[code];
      if (!row) return current;
      return { ...current, [code]: { ...row, ...next } };
    });
    markDirty(code);
  }

  function setDraft(code: string, key: NumericKey, value: string) {
    if (value.length > 24) return;
    if (!/^\d*(?:[.,]\d{0,3})?$/.test(value)) return;
    setDrafts((current) => ({
      ...current,
      [code]: { ...current[code], [key]: value },
    }));
    markDirty(code);
  }

  function buildRowFromDrafts(code: CategoryCode, row: TariffRow) {
    const nextRow = { ...row };
    const fields = [...COMMON_FIELDS, ...EXTRA_FIELDS[code]];
    for (const [key] of fields) {
      const raw = drafts[code]?.[key];
      if (raw == null) continue;
      const parsed = parseDraftValue(key, raw);
      if (parsed.error || parsed.value == null) return { error: parsed.error ?? "Valor inválido." };
      nextRow[key] = parsed.value;
    }
    return { row: nextRow };
  }

  function commitDraft(code: CategoryCode, key: NumericKey) {
    const row = tariffs[code];
    const raw = drafts[code]?.[key];
    if (!row || raw == null) return;
    const parsed = parseDraftValue(key, raw);
    if (parsed.error || parsed.value == null) {
      setSaveError(parsed.error ?? "Valor inválido.");
      return;
    }
    setTariffs((current) => ({
      ...current,
      [code]: { ...current[code], [key]: parsed.value as number },
    }));
    setDrafts((current) => ({
      ...current,
      [code]: { ...current[code], [key]: String(parsed.value) },
    }));
    setSaveError(null);
  }

  async function save(code: CategoryCode) {
    if (savingCode) return;
    const row = tariffs[code];
    if (!row || !dirtyRef.current.has(code)) return;

    const built = buildRowFromDrafts(code, row);
    if (!built.row) {
      setSaveError(built.error ?? "Revise os valores antes de salvar.");
      return;
    }
    const nextRow = built.row;
    const validation = validateRow(nextRow);
    if (validation) {
      setSaveError(validation);
      return;
    }

    setSavingCode(code);
    setSaveError(null);
    try {
      const input: AdminTariffInput = {
        categoryCode: code,
        city: cleanText(nextRow.city, "default").toLowerCase(),
        baseFare: nextRow.base_fare,
        minFare: nextRow.min_fare,
        perKm: nextRow.per_km,
        perMin: nextRow.per_min,
        stopFee: nextRow.stop_fee,
        fixedFee: nextRow.fixed_fee,
        dynamicMultiplier: nextRow.dynamic_multiplier,
        helper1Fee: nextRow.helper1_fee,
        helper2Fee: nextRow.helper2_fee,
        heavyFurnitureFee: nextRow.heavy_furniture_fee,
        assemblyFee: nextRow.assembly_fee,
        packingFee: nextRow.packing_fee,
        difficultAccessFee: nextRow.difficult_access_fee,
        stairFee: nextRow.stair_fee,
        heavyVehicleFee: nextRow.heavy_vehicle_fee,
        accidentFee: nextRow.accident_fee,
        platformFee: nextRow.platform_fee,
        lockedWheelsFee: nextRow.locked_wheels_fee,
        garageFee: nextRow.garage_fee,
        maxWeightKg: nextRow.max_weight_kg,
        perKg: nextRow.per_kg,
        isActive: nextRow.is_active,
      };
      await upsertAdminTariffRule(input);
      setTariffs((current) => ({ ...current, [code]: nextRow }));
      dirtyRef.current = new Set(dirtyRef.current);
      dirtyRef.current.delete(code);
      setDirtyCodes(new Set(dirtyRef.current));
      setDrafts((current) => {
        const next = { ...current };
        delete next[code];
        return next;
      });
      toast.success(`Tarifa de ${categoryMap.get(code)?.name ?? code} salva no modelo canônico.`);
    } catch (error) {
      setSaveError("Não foi possível salvar a tarifa. Revise os valores e tente novamente.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao salvar tarifa", error);
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
        <div role="status" aria-live="polite">
          <Loading label="Carregando tarifas..." />
        </div>
      ) : loadError ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="space-y-3 p-4" role="alert">
            <p className="text-sm font-medium text-destructive">{loadError}</p>
            <Button
              className="min-h-11 gap-2"
              variant="outline"
              onClick={() => setReloadNonce((value) => value + 1)}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : categories.length === 0 ? (
        <EmptyState
          icon={SlidersHorizontal}
          title="Nenhuma categoria tarifável"
          description="As cinco categorias canônicas aparecerão aqui quando estiverem disponíveis no backend."
        />
      ) : (
        <div className="space-y-4">
          <div className="flex min-w-0 items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <p className="min-w-0 break-words">
              O valor exibido ao passageiro continua sendo calculado pelo backend. Esta tela apenas
              administra os parâmetros tipados da tarifa; não existem campos livres de preço.
            </p>
          </div>

          <Tabs
            value={activeCode}
            onValueChange={(value) => {
              setActiveCode(value);
              setSaveError(null);
            }}
            className="space-y-4"
          >
            <TabsList className="flex h-auto max-w-full flex-wrap gap-1 p-1">
              {categories.map((category) => (
                <TabsTrigger
                  key={category.code}
                  value={category.code}
                  className="min-h-11 min-w-0 whitespace-normal text-center"
                >
                  {category.name}
                  {!category.is_active ? " (categoria off)" : ""}
                  {dirtyCodes.has(category.code) ? " •" : ""}
                </TabsTrigger>
              ))}
            </TabsList>

            {categories.map((category) => {
              const row = tariffs[category.code];
              if (!row) return null;
              const fields = [...COMMON_FIELDS, ...EXTRA_FIELDS[category.code]];
              const dirty = dirtyCodes.has(category.code);
              return (
                <TabsContent key={category.code} value={category.code} className="space-y-4">
                  <Card className="border-border bg-card/60">
                    <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <CardTitle className="break-words text-base">{category.name}</CardTitle>
                        <p className="mt-1 break-words text-sm text-muted-foreground">
                          Regra: {category.code} · cidade: {row.city}
                        </p>
                        {dirty ? (
                          <p className="mt-1 text-sm font-medium text-warning" role="status">
                            Alterações não salvas
                          </p>
                        ) : null}
                      </div>
                      <div className="flex min-h-11 items-center gap-2 text-sm font-medium">
                        <Switch
                          checked={row.is_active}
                          disabled={Boolean(savingCode)}
                          onCheckedChange={(value) =>
                            patch(category.code, { is_active: value === true })
                          }
                          aria-label={`${row.is_active ? "Desativar" : "Ativar"} tarifa de ${category.name}`}
                        />
                        <span>{row.is_active ? "Tarifa ativa" : "Tarifa desativada"}</span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {fields.map(([key, label]) => {
                          const displayValue = drafts[category.code]?.[key] ?? String(row[key]);
                          const inputId = `tariff-${category.code}-${key}`;
                          const helpId = `${inputId}-help`;
                          const invalid = Boolean(parseDraftValue(key, displayValue).error);
                          return (
                            <Field key={key} id={inputId} helpId={helpId} label={label} technical={key}>
                              <DSInput
                                id={inputId}
                                inputMode="decimal"
                                autoComplete="off"
                                value={displayValue}
                                disabled={Boolean(savingCode)}
                                className="min-h-11 text-base tabular-nums"
                                aria-invalid={invalid}
                                aria-describedby={helpId}
                                onChange={(event) =>
                                  setDraft(category.code, key, event.target.value)
                                }
                                onBlur={() => commitDraft(category.code, key)}
                              />
                            </Field>
                          );
                        })}
                      </div>

                      {saveError && activeCode === category.code ? (
                        <p
                          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                          role="alert"
                        >
                          {saveError}
                        </p>
                      ) : null}

                      <div className="flex justify-end">
                        <Button
                          onClick={() => void save(category.code)}
                          disabled={Boolean(savingCode) || !dirty}
                          className="min-h-11 gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          aria-busy={savingCode === category.code}
                        >
                          {savingCode === category.code ? (
                            <Loader2
                              className="h-4 w-4 animate-spin motion-reduce:animate-none"
                              aria-hidden="true"
                            />
                          ) : (
                            <Save className="h-4 w-4" aria-hidden="true" />
                          )}
                          {savingCode === category.code ? "Salvando…" : "Salvar tarifa"}
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
  id,
  helpId,
  label,
  technical,
  children,
}: {
  id: string;
  helpId: string;
  label: string;
  technical: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="break-words text-sm font-semibold text-muted-foreground">
        {label}
      </label>
      {children}
      <span id={helpId} className="break-all font-mono text-xs text-muted-foreground/80">
        Campo: {technical}
      </span>
    </div>
  );
}
