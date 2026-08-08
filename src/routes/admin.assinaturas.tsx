import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CreditCard, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { getAdminSettings } from "@/lib/adminSettings";
import { DSBadge, DSButton, DSCard, DSCardContent, DSInput, EmptyState, Loading } from "@/design-system";
import { toast } from "sonner";

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
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function statusVariant(status: string): "success" | "warning" | "danger" | "muted" {
  if (["active", "ativa", "teste"].includes(status)) return "success";
  if (["pending", "pendente"].includes(status)) return "warning";
  if (["overdue", "vencida", "atrasada", "suspended", "suspensa"].includes(status)) return "danger";
  return "muted";
}

function AdminAssinaturasPage() {
  const [rows, setRows] = useState<DriverSubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [monthlyPrice, setMonthlyPrice] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [driversResult, settings] = await Promise.all([
        supabase
          .from("drivers")
          .select("id,name,email,phone,city,state,subscription_status,approval_status,is_online,updated_at")
          .order("updated_at", { ascending: false }),
        getAdminSettings(["subscription.default_plan_price"]),
      ]);
      if (driversResult.error) throw driversResult.error;
      setRows((driversResult.data ?? []) as DriverSubscriptionRow[]);
      setMonthlyPrice(parseMoneySetting(settings.find((row) => row.key === "subscription.default_plan_price")?.value));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar as assinaturas.");
      setRows([]);
      setMonthlyPrice(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const channel = supabase
      .channel("admin-subscription-driver-state")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "drivers" }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [row.name, row.email, row.phone, row.city, row.state, row.subscription_status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [query, rows]);

  const counts = useMemo(() => {
    const normalized = rows.map((row) => row.subscription_status.toLowerCase());
    return {
      active: normalized.filter((status) => ["active", "ativa", "teste"].includes(status)).length,
      pending: normalized.filter((status) => ["pending", "pendente"].includes(status)).length,
      overdue: normalized.filter((status) => ["overdue", "vencida", "atrasada", "suspended", "suspensa"].includes(status)).length,
    };
  }, [rows]);

  return (
    <AdminLayout
      title="Assinaturas"
      description="Estado canônico da mensalidade registrado no perfil operacional do motorista"
      actions={
        <DSButton variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </DSButton>
      }
    >
      <DSCard className="mb-4 border-primary/20 bg-primary/5">
        <DSCardContent className="flex gap-3 p-4 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-semibold text-foreground">Sem modelo paralelo de assinatura</p>
            <p className="mt-1">
              Esta tela não usa as tabelas legadas subscription_plans/subscriptions nem permite fabricar pagamento manualmente. O status exibido é drivers.subscription_status; confirmação financeira deve vir do backend/provedor e de webhooks idempotentes.
            </p>
          </div>
        </DSCardContent>
      </DSCard>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Ativas/teste" value={counts.active} />
        <Metric label="Pendentes" value={counts.pending} />
        <Metric label="Vencidas/suspensas" value={counts.overdue} />
        <Metric
          label="Mensalidade configurada"
          value={monthlyPrice == null ? "Não definida" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(monthlyPrice)}
        />
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <DSInput className="pl-9" placeholder="Buscar motorista, cidade ou status" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>

      {loading ? (
        <Loading label="Carregando assinaturas..." />
      ) : filtered.length === 0 ? (
        <EmptyState icon={CreditCard} title="Nenhum motorista encontrado" description="Os status de mensalidade aparecerão aqui quando existirem perfis de motorista." />
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => (
            <DSCard key={row.id}>
              <DSCardContent className="flex flex-wrap items-center gap-3 p-4 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{row.name || "Motorista sem nome"}</p>
                  <p className="truncate text-xs text-muted-foreground">{row.email || row.phone || "Sem contato"}</p>
                  <p className="text-xs text-muted-foreground">{[row.city, row.state].filter(Boolean).join(" — ") || "Cidade não informada"}</p>
                </div>
                <DSBadge variant={statusVariant(row.subscription_status)}>{row.subscription_status}</DSBadge>
                <DSBadge variant={row.approval_status === "aprovado" ? "success" : "muted"}>{row.approval_status}</DSBadge>
                <DSBadge variant={row.is_online ? "primary" : "muted"}>{row.is_online ? "Online" : "Offline"}</DSBadge>
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
      <DSCardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-bold">{value}</p>
      </DSCardContent>
    </DSCard>
  );
}
