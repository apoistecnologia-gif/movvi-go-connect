import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { Search, RefreshCw, ExternalLink, Copy, Loader2, Wallet } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import {
  DSBadge,
  DSButton as Button,
  DSCard as Card,
  DSCardContent as CardContent,
  DSInput,
  Loading,
} from "@/design-system";

type BadgeVariant = "default" | "muted" | "primary" | "success" | "danger" | "warning" | "outline";
import { toast } from "sonner";
import { formatBRL, formatDate } from "@/lib/formatters";

export const Route = createFileRoute("/admin/financeiro-motoristas")({
  head: () => ({
    meta: [{ title: "Financeiro dos motoristas — Admin MOVVI" }],
  }),
  component: AdminFinanceiroMotoristasPage,
});

type Row = {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  approval_status: string;
  financial_status: string | null;
  subscription_status: string | null;
  subscription_value: number | null;
  next_due_date: string | null;
  last_payment_status: string | null;
  last_invoice_url: string | null;
  mercadopago_init_point: string | null;
  mercadopago_preapproval_id: string | null;
  updated_at: string | null;
  last_event_at?: string | null;
  last_event_type?: string | null;
};

type FilterKey = "all" | "active" | "pending" | "overdue" | "cancelled" | "no_charge";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "active", label: "Ativos" },
  { key: "pending", label: "Pendentes" },
  { key: "overdue", label: "Em atraso" },
  { key: "cancelled", label: "Cancelados" },
  { key: "no_charge", label: "Sem cobrança" },
];

function financialTone(status: string | null): BadgeVariant {
  switch (status) {
    case "active":
      return "success";
    case "pending":
      return "warning";
    case "overdue":
      return "danger";
    case "cancelled":
      return "muted";
    default:
      return "default";
  }
}

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

async function regenerateDriverCharge(driverId: string) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (sessionError || !accessToken) throw new Error("admin_session_missing");
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/regenerate-driver-mercadopago-charge`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ driverId }),
  });
  const payload = (await res.json().catch(() => null)) as {
    ok?: boolean;
    initPoint?: string | null;
    preferenceId?: string;
    dueDate?: string;
    error?: string;
  } | null;
  if (!res.ok || !payload?.ok) {
    throw new Error(payload?.error ?? `http_${res.status}`);
  }
  return payload;
}

function AdminFinanceiroMotoristasPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("drivers")
      .select(
        "id,user_id,name,email,phone,city,state,approval_status,financial_status,subscription_status,subscription_value,next_due_date,last_payment_status,last_invoice_url,mercadopago_init_point,mercadopago_preapproval_id,updated_at",
      )
      .order("next_due_date", { ascending: true, nullsFirst: false })
      .limit(500);

    if (error) {
      toast.error("Falha ao carregar motoristas", { description: error.message });
      setRows([]);
      setLoading(false);
      return;
    }

    const base = (data ?? []) as Row[];

    // Fetch most recent driver_payment_events per driver (bulk)
    const driverIds = base.map((r) => r.id);
    if (driverIds.length) {
      const { data: events } = await supabase
        .from("driver_payment_events")
        .select("driver_id,event_type,created_at")
        .in("driver_id", driverIds)
        .order("created_at", { ascending: false })
        .limit(1000);
      const seen = new Map<string, { at: string; type: string }>();
      for (const e of events ?? []) {
        if (!e.driver_id || seen.has(e.driver_id)) continue;
        seen.set(e.driver_id, { at: e.created_at as string, type: (e.event_type as string) ?? "" });
      }
      for (const r of base) {
        const s = seen.get(r.id);
        if (s) {
          r.last_event_at = s.at;
          r.last_event_type = s.type;
        }
      }
    }

    setRows(base);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (r.approval_status !== "aprovado") return false;
      if (filter === "no_charge") {
        if (r.mercadopago_init_point) return false;
      } else if (filter !== "all") {
        if ((r.financial_status ?? "") !== filter) return false;
      }
      if (!s) return true;
      return (
        r.name?.toLowerCase().includes(s) ||
        r.email?.toLowerCase().includes(s) ||
        r.phone?.toLowerCase().includes(s) ||
        r.city?.toLowerCase().includes(s)
      );
    });
  }, [rows, filter, search]);

  const counts = useMemo(() => {
    const approved = (rows ?? []).filter((r) => r.approval_status === "aprovado");
    return {
      total: approved.length,
      active: approved.filter((r) => r.financial_status === "active").length,
      pending: approved.filter((r) => r.financial_status === "pending").length,
      overdue: approved.filter((r) => r.financial_status === "overdue").length,
      no_charge: approved.filter((r) => !r.mercadopago_init_point).length,
    };
  }, [rows]);

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado`);
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  async function handleRegenerate(r: Row) {
    setBusyId(r.id);
    try {
      const res = await regenerateDriverCharge(r.id);
      toast.success("Nova cobrança gerada");
      if (res.initPoint) {
        try {
          await navigator.clipboard.writeText(res.initPoint);
        } catch {
          /* ignore */
        }
      }
      await load();
    } catch (e) {
      toast.error("Falha ao gerar cobrança", { description: (e as Error).message });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminLayout
      title="Financeiro dos motoristas"
      description="Monitoramento de mensalidades, status e cobranças Mercado Pago"
      actions={
        <Button variant="ghost" size="icon" onClick={load} aria-label="Atualizar">
          <RefreshCw className="h-4 w-4" />
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5 mb-4">
        {[
          { label: "Aprovados", value: counts.total, variant: "default" as BadgeVariant },
          { label: "Ativos", value: counts.active, variant: "success" as BadgeVariant },
          { label: "Pendentes", value: counts.pending, variant: "warning" as BadgeVariant },
          { label: "Em atraso", value: counts.overdue, variant: "danger" as BadgeVariant },
          { label: "Sem cobrança", value: counts.no_charge, variant: "muted" as BadgeVariant },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-3">
              <div className="text-[11px] text-muted-foreground">{k.label}</div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-lg font-semibold">{k.value}</span>
                <DSBadge variant={k.variant}>{k.label}</DSBadge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>


      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <DSInput
            className="pl-8"
            placeholder="Buscar por nome, email, telefone ou cidade"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? "default" : "secondary"}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loading label="Carregando motoristas..." />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <Wallet className="h-6 w-6" />
            Nenhum motorista encontrado com os filtros atuais.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const days = daysUntil(r.next_due_date);
            const dueLabel =
              days == null
                ? "Sem vencimento"
                : days < 0
                  ? `Vencido há ${Math.abs(days)}d`
                  : days === 0
                    ? "Vence hoje"
                    : `Vence em ${days}d`;
            const initPoint = r.mercadopago_init_point;
            return (
              <Card key={r.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium truncate">{r.name}</span>
                        <DSBadge variant={financialTone(r.financial_status)}>
                          {r.financial_status ?? "—"}
                        </DSBadge>
                        {r.subscription_status && (
                          <DSBadge variant="muted">{r.subscription_status}</DSBadge>

                        )}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground truncate">
                        {r.email}
                        {r.city ? ` • ${r.city}/${r.state ?? ""}` : ""}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs md:grid-cols-4">
                        <div>
                          <span className="text-muted-foreground">Mensalidade: </span>
                          {r.subscription_value != null ? formatBRL(r.subscription_value) : "—"}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Vencimento: </span>
                          <span
                            className={
                              days != null && days < 0
                                ? "text-destructive"
                                : days != null && days <= 3
                                  ? "text-amber-500"
                                  : ""
                            }
                          >
                            {r.next_due_date ?? "—"} ({dueLabel})
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Último pgto: </span>
                          {r.last_payment_status ?? "—"}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Sincronizado: </span>
                          {r.last_event_at
                            ? formatDate(r.last_event_at)
                            : r.updated_at
                              ? formatDate(r.updated_at)
                              : "—"}
                          {r.last_event_type ? (
                            <span className="ml-1 text-muted-foreground">
                              ({r.last_event_type})
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {r.mercadopago_preapproval_id && (
                        <div className="mt-1 text-[11px] text-muted-foreground truncate">
                          Preference: {r.mercadopago_preapproval_id}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 md:min-w-[220px]">
                      {initPoint ? (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => window.open(initPoint, "_blank", "noopener")}
                          >
                            <ExternalLink className="mr-2 h-3.5 w-3.5" />
                            Ver init_point
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copy(initPoint, "init_point")}
                          >
                            <Copy className="mr-2 h-3.5 w-3.5" />
                            Copiar link
                          </Button>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Sem init_point ativo
                        </span>
                      )}
                      {r.last_invoice_url && r.last_invoice_url !== initPoint && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => window.open(r.last_invoice_url!, "_blank", "noopener")}
                        >
                          <ExternalLink className="mr-2 h-3.5 w-3.5" />
                          Última fatura
                        </Button>
                      )}
                      <Button
                        size="sm"
                        onClick={() => handleRegenerate(r)}
                        disabled={busyId === r.id}
                      >
                        {busyId === r.id ? (
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-2 h-3.5 w-3.5" />
                        )}
                        Gerar cobrança
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}
