/* eslint-disable @typescript-eslint/no-explicit-any -- Temporary Phase 8 bridge until generated Supabase types include canonical admin RPCs. */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Save, ShieldCheck, Sliders } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { getAdminSettings } from "@/lib/adminSettings";
import { DSBadge, DSButton, DSCard, DSCardContent, DSInput, Loading } from "@/design-system";

export const Route = createFileRoute("/admin/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Admin APOIS" }] }),
  component: AdminConfigPage,
});

type EditableSetting = {
  key:
    | "ride.cancellation_fee_amount"
    | "ride.cancellation_free_minutes"
    | "ride.next_offer_max_distance_km"
    | "finance.platform_fee_percent";
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
    description:
      "Minutos iniciais em que o cancelamento pode permanecer isento conforme o lifecycle.",
    min: 0,
    max: 60,
    step: 1,
    suffix: "min",
  },
  {
    key: "ride.next_offer_max_distance_km",
    label: "Raio da próxima corrida",
    description:
      "Distância máxima para oferecer nova corrida a motorista elegível próximo do fim da atual.",
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

function parseDraft(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function AdminConfigPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [persistedValues, setPersistedValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const requestRef = useRef(0);

  async function load() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await getAdminSettings(EDITABLE_SETTINGS.map((item) => item.key));
      if (requestId !== requestRef.current) return;
      const next: Record<string, string> = {};
      for (const item of EDITABLE_SETTINGS) next[item.key] = "";
      for (const row of rows) {
        if (!EDITABLE_SETTINGS.some((item) => item.key === row.key)) continue;
        const value = Number(row.value);
        if (Number.isFinite(value)) next[row.key] = String(value);
      }
      setValues(next);
      setPersistedValues(next);
    } catch (error) {
      if (requestId !== requestRef.current) return;
      setLoadError("Não foi possível carregar as configurações agora. Tente novamente.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao carregar configurações", error);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    return () => {
      requestRef.current += 1;
    };
  }, []);

  async function save(item: EditableSetting) {
    if (saving) return;
    setSaveError(null);
    const draft = values[item.key] ?? "";
    const value = parseDraft(draft);
    if (value === null || value < item.min || value > item.max) {
      setSaveError(`Revise ${item.label.toLowerCase()}: use um valor entre ${item.min} e ${item.max}.`);
      return;
    }
    if (draft === persistedValues[item.key]) return;

    setSaving(item.key);
    try {
      const { error } = await (supabase as any).rpc("admin_update_setting", {
        _key: item.key,
        _value: value,
      });
      if (error) throw error;
      const canonical = String(value);
      setValues((current) => ({ ...current, [item.key]: canonical }));
      setPersistedValues((current) => ({ ...current, [item.key]: canonical }));
    } catch (error) {
      setSaveError(`Não foi possível salvar ${item.label.toLowerCase()} agora. Tente novamente.`);
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao salvar configuração", error);
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <AdminLayout title="Configurações">
        <div aria-live="polite">
          <Loading label="Carregando configurações canônicas..." />
        </div>
      </AdminLayout>
    );
  }

  if (loadError) {
    return (
      <AdminLayout title="Configurações" description="Regras operacionais do backend canônico.">
        <DSCard className="border-destructive/30 bg-destructive/5">
          <DSCardContent className="space-y-3 p-4" role="alert">
            <p className="text-sm font-medium text-destructive">{loadError}</p>
            <DSButton variant="outline" onClick={() => void load()} className="min-h-11 gap-2">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Tentar novamente
            </DSButton>
          </DSCardContent>
        </DSCard>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Configurações"
      description="Somente regras realmente ligadas ao backend canônico podem ser alteradas aqui."
    >
      <DSCard className="mb-4 border-primary/20 bg-primary/5">
        <DSCardContent className="flex min-w-0 gap-3 p-4 text-sm leading-6 text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold text-foreground">Configuração server-side e auditada</p>
            <p className="mt-1 break-words">
              Chaves de Google, Firebase, provedores financeiros, payout e outros secrets não são
              editadas nem lidas diretamente pelo navegador. O backend libera somente as chaves
              operacionais explicitamente permitidas.
            </p>
          </div>
        </DSCardContent>
      </DSCard>

      {saveError ? (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
          {saveError}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {EDITABLE_SETTINGS.map((item) => {
          const draft = values[item.key] ?? "";
          const parsed = parseDraft(draft);
          const invalid = parsed === null || parsed < item.min || parsed > item.max;
          const changed = draft !== (persistedValues[item.key] ?? "");
          const inputId = `admin-setting-${item.key.replaceAll(".", "-")}`;
          const helpId = `${inputId}-help`;
          return (
            <DSCard key={item.key}>
              <DSCardContent className="space-y-4 p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
                    <Sliders className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h2 className="min-w-0 break-words font-semibold">{item.label}</h2>
                      <DSBadge variant="muted">Chave auditada</DSBadge>
                    </div>
                    <p id={helpId} className="mt-1 text-sm leading-5 text-muted-foreground">
                      {item.description} Faixa permitida: {item.min} a {item.max} {item.suffix}.
                    </p>
                  </div>
                </div>

                <div className="flex min-w-0 flex-wrap items-end gap-2 sm:flex-nowrap">
                  <div className="min-w-[150px] flex-1">
                    <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-foreground">
                      Valor
                    </label>
                    <DSInput
                      id={inputId}
                      type="text"
                      inputMode="decimal"
                      value={draft}
                      onChange={(event) => {
                        setSaveError(null);
                        setValues((current) => ({ ...current, [item.key]: event.target.value }));
                      }}
                      disabled={Boolean(saving)}
                      aria-describedby={helpId}
                      aria-invalid={invalid}
                      className="min-h-11 text-base"
                    />
                  </div>
                  <span className="flex min-h-11 min-w-10 items-center text-sm font-semibold text-muted-foreground" aria-hidden="true">
                    {item.suffix}
                  </span>
                  <DSButton
                    onClick={() => void save(item)}
                    disabled={Boolean(saving) || invalid || !changed}
                    className="min-h-11 gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-busy={saving === item.key}
                  >
                    {saving === item.key ? (
                      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    ) : (
                      <Save className="h-4 w-4" aria-hidden="true" />
                    )}
                    {saving === item.key ? "Salvando…" : changed ? "Salvar" : "Salvo"}
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
