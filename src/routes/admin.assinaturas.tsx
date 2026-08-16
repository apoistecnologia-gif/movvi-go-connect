import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { CreditCard, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { getAdminSettings } from "@/lib/adminSettings";
import {
  DSBadge,
  DSButton,
  DSCard,
  DSCardContent,
  DSInput,
  EmptyState,
  Loading,
} from "@/design-system";

type DriverSubscriptionRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  subscription_status: string;
  approval_status: string;
  is_online: boolean;
  updated_at: string;
};

export const Route = createFileRoute("/admin/assinaturas")({
  head: () => ({ meta: [{ title: "Assinaturas — Admin APOIS" }] }),
  component: AdminAssinaturasPage,
});

function parseMoneySetting(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim().replace(",", "."));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

function cleanText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text || fallback;
}

function normalizeStatus(value: unknown) {
  return cleanText(value, "não informado").toLowerCase();
}

function subscriptionLabel(status: string) {
  const normalized = normalizeStatus(status);
  if (["active", "ativa", "ativo", "paid", "pago"].includes(normalized)) return "Ativa";
  if (["teste", "trial", "homologacao", "homologação"].includes(normalized)) return "Homologação";
  if (["pending", "pendente", "processing", "processando"].includes(normalized)) return "Pendente";
  if (["overdue", "vencida", "atrasada"].includes(normalized)) return "Vencida";
  if (["suspended", "suspensa", "suspenso"].includes(normalized)) return "Suspensa";
  if (["inactive", "inativa", "inativo"].includes(normalized)) return "Inativa";
  return cleanText(status, "Não informado");
}

function approvalLabel(status: string) {
  const normalized = normalizeStatus(status);
  if (["aprovado", "approved", "ativo", "active"].includes(normalized)) return "Aprovado";
  if (["rejeitado", "rejected"].includes(normalized)) return "Rejeitado";
  if (["pendente", "pending", "em_analise", "em análise"].includes(normalized)) return "Em análise";
  return cleanText(status, "Não informado");
}

function statusVariant(status: string): "success" | "warning" | "danger" | "muted" {
  const normalized = normalizeStatus(status);
  if (["active", "ativa", "ativo", "paid", "pago", "teste", "trial", "homologacao", "homologação"].includes(normalized)) return "success";
  if (["pending", "pendente", "processing", "processando"].includes(normalized)) return "warning";
  if (["overdue", "vencida", "atrasada", "suspended", "suspensa", "suspenso"].includes(normalized)) return "danger";
  return "muted";
}

function safeDate(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

function AdminAssinaturasPage() {
  const [rows, setRows] = useState<DriverSubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [monthlyPrice, setMonthlyPrice] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestRef = useRef(0);

  async function load() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const [driversResult, settings] = await Promise.all([
        supabase
          .from("drivers")
          .select(
            "id,name,email,phone,city,state,subscription_status,approval_status,is_online,updated_at",
          )
          .order("updated_at", { ascending: false }),
        getAdminSettings(["subscription.default_plan_price"]),
      ]);
      if (requestId !== requestRef.current) return;
      if (driversResult.error) throw driversResult.error;

      const normalizedRows = ((driversResult.data ?? []) as DriverSubscriptionRow[])
        .filter((row) => Boolean(cleanText(row.id)))
        .map((row) => ({
          ...row,
          id: cleanText(row.id),
          name: cleanText(row.name) || null,
          email: cleanText(row.email) || null,
          phone: cleanText(row.phone) || null,
          city: cleanText(row.city) || null,
          state: cleanText(row.state) || null,
          subscription_status: normalizeStatus(row.subscription_status),
          approval_status: normalizeStatus(row.approval_status),
          is_online: row.is_online === true,
          updated_at: safeDate(row.updated_at)?.toISOString() ?? "",
        }));
      setRows(normalizedRows);
      setMonthlyPrice(
        parseMoneySetting(
          settings.find((row) => row.key === "subscription.default_plan_price")?.value,
        ),
      );
    } catch (error) {
      if (requestId !== requestRef.current) return;
      setRows([]);
      setMonthlyPrice(null);
      setLoadError("Não foi possível carregar as mensalidades agora. Tente novamente.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao carregar mensalidades", error);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    let refreshTimer: number | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void load(), 250);
    };
    const channel = supabase
      .channel("admin-subscription-driver-state")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "drivers" },
        scheduleRefresh,
      )
      .subscribe();
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      requestRef.current += 1;
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    if (!needle) return rows;
    return rows.filter((row) =>
      [row.name, row.email, row.phone, row.city, row.state, subscriptionLabel(row.subscription_status)]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(needle)),
    );
  }, [query, rows]);

  const counts = useMemo(() => {
    const normalized = rows.map((row) => normalizeStatus(row.subscription_status));
    return {
      active: normalized.filter((status) => ["active", "ativa", "ativo", "paid", "pago", "teste", "trial", "homologacao", "homologação"].includes(status)).length,
      pending: normalized.filter((status) => ["pending", "pendente", "processing", "processando"].includes(status)).length,
      overdue: normalized.filter((status) =>
        ["overdue", "vencida", "atrasada", "suspended", "suspensa", "suspenso"].includes(status),
      ).length,
    };
  }, [rows]);

  return (
    <AdminLayout
      title="Assinaturas"
      description="Estado canônico da mensalidade registrado no perfil operacional do motorista"
      actions={
        <DSButton
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
          className="min-h-11 gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-busy={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
          {loading ? "Atualizando…" : "Atualizar"}
        </DSButton>
      }
    >
      <DSCard className="mb-4 border-primary/20 bg-primary/5">
        <DSCardContent className="flex min-w-0 gap-3 p-4 text-sm leading-6 text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold text-foreground">Mensalidade vinculada ao backend</p>
            <p className="mt-1 break-words">
              O estado canônico exibido é <strong>drivers.subscription_status</strong>. Confirmações
              financeiras são realizadas pelo backend e pelos webhooks do provedor configurado para
              mensalidade; esta tela não fabrica pagamento nem mantém uma verdade paralela.
            </p>
          </div>
        </DSCardContent>
      </DSCard>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Ativas / homologação" value={counts.active} />
        <Metric label="Pendentes" value={counts.pending} />
        <Metric label="Vencidas / suspensas" value={counts.overdue} />
        <Metric
          label="Mensalidade configurada"
          value={
            monthlyPrice == null
              ? "Não definida"
              : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                  monthlyPrice,
                )
          }
        />
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <DSInput
          className="min-h-11 pl-9 text-base"
          placeholder="Buscar motorista, cidade ou status"
          value={query}
          maxLength={120}
          aria-label="Buscar mensalidade por motorista, cidade ou status"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {loading ? (
        <div aria-live="polite"><Loading label="Carregando assinaturas..." /></div>
      ) : loadError ? (
        <DSCard className="border-destructive/30 bg-destructive/5">
          <DSCardContent className="space-y-3 p-4" role="alert">
            <p className="text-sm font-medium text-destructive">{loadError}</p>
            <DSButton variant="outline" className="min-h-11" onClick={() => void load()}>
              Tentar novamente
            </DSButton>
          </DSCardContent>
        </DSCard>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title={query.trim() ? "Nenhum resultado para a busca" : "Nenhum motorista encontrado"}
          description={query.trim() ? "Revise os termos pesquisados." : "Os status de mensalidade aparecerão aqui quando existirem perfis de motorista."}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => (
            <DSCard key={row.id}>
              <DSCardContent className="flex min-w-0 flex-wrap items-center gap-3 p-4 text-sm">
                <div className="min-w-0 flex-1 basis-52">
                  <p className="break-words font-semibold">{row.name || "Motorista sem nome"}</p>
                  <p className="break-all text-sm text-muted-foreground">
                    {row.email || row.phone || "Sem contato"}
                  </p>
                  <p className="break-words text-sm text-muted-foreground">
                    {[row.city, row.state].filter(Boolean).join(" — ") || "Cidade não informada"}
                  </p>
                  {row.updated_at ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Atualizado em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(row.updated_at))}
                    </p>
                  ) : null}
                </div>
                <div className="flex max-w-full flex-wrap gap-2">
                  <DSBadge variant={statusVariant(row.subscription_status)}>
                    {subscriptionLabel(row.subscription_status)}
                  </DSBadge>
                  <DSBadge variant={["aprovado", "approved", "ativo", "active"].includes(normalizeStatus(row.approval_status)) ? "success" : "muted"}>
                    {approvalLabel(row.approval_status)}
                  </DSBadge>
                  <DSBadge variant={row.is_online ? "primary" : "muted"}>
                    {row.is_online ? "Online" : "Offline"}
                  </DSBadge>
                </div>
              </DSCardContent>
            </DSCard>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <DSCard>
      <DSCardContent className="min-w-0 p-4">
        <p className="break-words text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 break-words text-xl font-bold tabular-nums">{value}</p>
      </DSCardContent>
    </DSCard>
  );
}
