/* eslint-disable @typescript-eslint/no-explicit-any -- Temporary Phase 8 bridge until generated Supabase types include canonical admin RPCs. */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import {
  DSButton as Button,
  DSCard as Card,
  DSCardContent as CardContent,
  DSInput,
  EmptyState,
  Loading,
} from "@/design-system";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ICON_REGISTRY } from "@/lib/uiCategories";
import { updateAdminRideCategory } from "@/lib/adminControlPlane";
import { useRideFeatureFlags } from "@/hooks/useRideFeatureFlags";
import { isRideCategoryEnabled } from "@/lib/rideFeatureFlags";

export const Route = createFileRoute("/admin/categorias")({
  head: () => ({ meta: [{ title: "Categorias — Admin APOIS" }] }),
  component: AdminCategoriasPage,
});

type Row = {
  id: string;
  code: "carros" | "motos" | "fretes" | "guincho" | "envios";
  name: string;
  description: string | null;
  icon: string | null;
  image_url: string | null;
  capacity_label: string | null;
  eta_label: string | null;
  sort_order: number;
  is_active: boolean;
};

const CANONICAL_CODES = new Set<Row["code"]>(["carros", "motos", "fretes", "guincho", "envios"]);
const ICON_NAMES = Object.keys(ICON_REGISTRY);

function textOrNull(value: unknown, max: number) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
  return text || null;
}

function safeImageValue(value: unknown) {
  const text = String(value ?? "").trim().slice(0, 500);
  if (!text) return null;
  if (/^(javascript|data):/i.test(text)) return null;
  return text;
}

function safeOrder(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(9999, Math.max(0, Math.round(number))) : 0;
}

function normalizeRow(value: unknown): Row | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<Row>;
  const id = String(candidate.id ?? "").trim();
  const code = String(candidate.code ?? "") as Row["code"];
  if (!id || !CANONICAL_CODES.has(code)) return null;
  return {
    id,
    code,
    name: textOrNull(candidate.name, 80) ?? code,
    description: textOrNull(candidate.description, 240),
    icon: ICON_NAMES.includes(String(candidate.icon ?? "")) ? String(candidate.icon) : (ICON_NAMES[0] ?? null),
    image_url: safeImageValue(candidate.image_url),
    capacity_label: textOrNull(candidate.capacity_label, 80),
    eta_label: textOrNull(candidate.eta_label, 80),
    sort_order: safeOrder(candidate.sort_order),
    is_active: candidate.is_active === true,
  };
}

function AdminCategoriasPage() {
  const flags = useRideFeatureFlags();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const dirtyIdsRef = useRef(new Set<string>());
  const requestRef = useRef(0);

  async function refresh({ preserveDirty = true }: { preserveDirty?: boolean } = {}) {
    const requestId = ++requestRef.current;
    setLoadError(null);
    const { data, error } = await (supabase as any)
      .from("ride_categories")
      .select(
        "id,code,name,description,icon,image_url,capacity_label,eta_label,sort_order,is_active",
      )
      .order("sort_order", { ascending: true });
    if (requestId !== requestRef.current) return;
    if (error) {
      setLoadError("Não foi possível carregar as categorias agora. Tente novamente.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao carregar categorias", error);
      setLoading(false);
      return;
    }

    const incoming = ((data ?? []) as unknown[])
      .map(normalizeRow)
      .filter((row: Row | null): row is Row => Boolean(row));
    setRows((current) => {
      if (!preserveDirty || dirtyIdsRef.current.size === 0) return incoming;
      const currentById = new Map(current.map((row: Row) => [row.id, row]));
      return incoming.map((row: Row) =>
        dirtyIdsRef.current.has(row.id) ? (currentById.get(row.id) ?? row) : row,
      );
    });
    setLoading(false);
  }

  useEffect(() => {
    let alive = true;
    void refresh({ preserveDirty: false });
    const channel = supabase
      .channel("admin-ride-categories-canonical")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ride_categories" },
        () => {
          if (alive) void refresh({ preserveDirty: true });
        },
      )
      .subscribe();
    return () => {
      alive = false;
      requestRef.current += 1;
      void supabase.removeChannel(channel);
    };
  }, []);

  function patch(id: string, next: Partial<Row>) {
    if (savingId) return;
    dirtyIdsRef.current.add(id);
    setRowError(null);
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...next } : row)));
  }

  async function save(row: Row) {
    if (savingId) return;
    const name = textOrNull(row.name, 80);
    if (!row.id.trim() || !name) {
      setRowError({ id: row.id, message: "Informe um nome válido para a categoria." });
      return;
    }
    if (!ICON_NAMES.includes(String(row.icon ?? ""))) {
      setRowError({ id: row.id, message: "Selecione um ícone válido." });
      return;
    }
    const imageUrl = safeImageValue(row.image_url);
    if (row.image_url && !imageUrl) {
      setRowError({ id: row.id, message: "A imagem informada não é válida." });
      return;
    }

    setSavingId(row.id);
    setRowError(null);
    try {
      await updateAdminRideCategory({
        id: row.id,
        name,
        description: textOrNull(row.description, 240),
        icon: row.icon,
        imageUrl,
        capacityLabel: textOrNull(row.capacity_label, 80),
        etaLabel: textOrNull(row.eta_label, 80),
        sortOrder: safeOrder(row.sort_order),
        isActive: row.is_active === true,
      });
      dirtyIdsRef.current.delete(row.id);
      toast.success(`${name} atualizada`);
      await refresh({ preserveDirty: true });
    } catch (error) {
      setRowError({ id: row.id, message: "Não foi possível salvar esta categoria agora. Tente novamente." });
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao salvar categoria", error);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <AdminLayout
      title="Categorias de Corrida"
      description="Edite somente as cinco categorias canônicas usadas pelo Fare Engine e pelo Dispatch."
    >
      {loading ? (
        <div aria-live="polite">
          <Loading label="Carregando categorias..." />
        </div>
      ) : loadError ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="space-y-3 p-4" role="alert">
            <p className="text-sm font-medium text-destructive">{loadError}</p>
            <Button variant="outline" onClick={() => void refresh({ preserveDirty: true })} className="min-h-11 gap-2">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex min-w-0 items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <p className="min-w-0 break-words">
              Os códigos <strong>carros, motos, fretes, guincho e envios</strong> fazem parte do
              contrato da corrida. Por segurança, o painel não cria nem exclui códigos arbitrários;
              ele controla apresentação, ordem e disponibilidade.
            </p>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="Nenhuma categoria disponível"
              description="As categorias canônicas não foram retornadas pelo backend."
            />
          ) : (
            <div className="grid gap-3">
              {rows.map((row) => {
                const dirty = dirtyIdsRef.current.has(row.id);
                const busy = savingId === row.id;
                const error = rowError?.id === row.id ? rowError.message : null;
                const featureDisabled = !isRideCategoryEnabled(row.code, flags);
                return (
                  <Card key={row.id} className="border-border bg-card/60">
                    <CardContent className="space-y-4 p-4" aria-busy={busy}>
                      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                            Código canônico
                          </p>
                          <p className="break-words font-mono text-sm font-semibold text-primary">{row.code}</p>
                          {featureDisabled && (
                            <p className="mt-1 text-xs font-semibold text-amber-400">Em breve • flag desativada</p>
                          )}
                        </div>
                        <label className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium focus-within:ring-2 focus-within:ring-primary">
                          <Switch
                            checked={row.is_active}
                            onCheckedChange={(value) => patch(row.id, { is_active: value })}
                            disabled={Boolean(savingId)}
                            aria-label={`${row.name}: ${row.is_active ? "desativar" : "ativar"} categoria`}
                          />
                          {row.is_active ? "Ativa" : "Desativada"}
                        </label>
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <Field label="Nome">
                          <DSInput
                            value={row.name}
                            maxLength={80}
                            disabled={Boolean(savingId)}
                            onChange={(e) => patch(row.id, { name: e.target.value })}
                            className="min-h-11 text-base"
                          />
                        </Field>
                        <Field label="Descrição">
                          <DSInput
                            value={row.description ?? ""}
                            maxLength={240}
                            disabled={Boolean(savingId)}
                            onChange={(e) => patch(row.id, { description: e.target.value || null })}
                            className="min-h-11 text-base"
                          />
                        </Field>
                        <Field label="Ícone">
                          <select
                            value={row.icon ?? ICON_NAMES[0] ?? "Car"}
                            onChange={(e) => patch(row.id, { icon: e.target.value })}
                            disabled={Boolean(savingId)}
                            className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
                          >
                            {ICON_NAMES.map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Capacidade">
                          <DSInput
                            value={row.capacity_label ?? ""}
                            maxLength={80}
                            disabled={Boolean(savingId)}
                            onChange={(e) => patch(row.id, { capacity_label: e.target.value || null })}
                            className="min-h-11 text-base"
                          />
                        </Field>
                        <Field label="ETA exibido">
                          <DSInput
                            value={row.eta_label ?? ""}
                            maxLength={80}
                            disabled={Boolean(savingId)}
                            onChange={(e) => patch(row.id, { eta_label: e.target.value || null })}
                            className="min-h-11 text-base"
                          />
                        </Field>
                        <Field label="Ordem">
                          <DSInput
                            type="number"
                            min={0}
                            max={9999}
                            step={1}
                            value={row.sort_order}
                            disabled={Boolean(savingId)}
                            onChange={(e) => patch(row.id, { sort_order: safeOrder(e.target.value) })}
                            className="min-h-11 text-base"
                          />
                        </Field>
                        <Field label="Imagem (URL/path)">
                          <DSInput
                            value={row.image_url ?? ""}
                            maxLength={500}
                            disabled={Boolean(savingId)}
                            onChange={(e) => patch(row.id, { image_url: e.target.value || null })}
                            className="min-h-11 text-base"
                          />
                        </Field>
                      </div>

                      {error ? (
                        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive" role="alert">
                          {error}
                        </p>
                      ) : null}

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {dirty ? <span className="text-sm text-muted-foreground">Alterações não salvas</span> : null}
                        <Button
                          onClick={() => void save(row)}
                          disabled={Boolean(savingId) || !dirty}
                          className="min-h-11 gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          aria-busy={busy}
                        >
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                          ) : (
                            <Save className="h-4 w-4" aria-hidden="true" />
                          )}
                          {busy ? "Salvando…" : dirty ? "Salvar categoria" : "Salvo"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
