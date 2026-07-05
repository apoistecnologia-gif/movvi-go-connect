import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Plus,
  Loader2,
  Save,
  Trash2,
  Pause,
  Search,
  RefreshCw,
  ExternalLink,
  Copy,
  FileText,
  AlertTriangle,
  User as UserIcon,
  StickyNote,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { DSBadge, DSButton as Button, DSCard as Card, DSCardContent as CardContent, DSInput, DSTextarea, Loading, StatusPill } from "@/design-system";
import { Switch } from "@/components/ui/switch";
// Badge legacy substituído por SubPill (StatusPill do design system).
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { logAdminAction } from "@/lib/adminAudit";
import { formatBRL, formatDate } from "@/lib/formatters";
import { adminRefreshAsaasPayment } from "@/lib/payments/adminReconcile.functions";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";

export const Route = createFileRoute("/admin/assinaturas")({
  head: () => ({ meta: [{ title: "Assinaturas — Admin MOVVI" }] }),
  component: AdminAssinaturasPage,
});

type Plan = {
  id: string;
  name: string;
  price: number;
  promotional_price: number | null;
  billing_cycle_days: number;
  grace_period_days: number;
  enabled: boolean;
};

type Sub = {
  id: string;
  driver_id: string;
  plan_id: string | null;
  status: string;
  amount: number;
  period_start: string | null;
  period_end: string | null;
  grace_until: string | null;
  auto_suspend: boolean;
  payment_method: string | null;
  provider_reference: string | null;
  asaas_payment_id: string | null;
  invoice_url: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

type Driver = {
  id: string;
  user_id: string;
  name: string | null;
  phone: string | null;
  city: string | null;
  photo_url: string | null;
  selfie_url: string | null;
  asaas_customer_id: string | null;
  subscription_status: string | null;
  subscription_expires_at: string | null;
};

type FilterKey =
  | "all"
  | "ativa"
  | "pending"
  | "vencida"
  | "blocked"
  | "cancelled"
  | "due_today"
  | "due_3"
  | "due_7"
  | "inadimplente";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "ativa", label: "Ativas" },
  { key: "pending", label: "Pendentes" },
  { key: "vencida", label: "Vencidas" },
  { key: "blocked", label: "Bloqueadas" },
  { key: "cancelled", label: "Canceladas" },
  { key: "due_today", label: "Vencem hoje" },
  { key: "due_3", label: "Vencem em 3 dias" },
  { key: "due_7", label: "Vencem em 7 dias" },
  { key: "inadimplente", label: "Inadimplentes" },
];

const STATUS_TONE: Record<string, string> = {
  ativa: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  active: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  pending: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  vencida: "bg-red-500/15 text-red-300 border-red-500/30",
  overdue: "bg-red-500/15 text-red-300 border-red-500/30",
  expired: "bg-red-500/15 text-red-300 border-red-500/30",
  blocked: "bg-red-500/20 text-red-300 border-red-500/40",
  suspended: "bg-red-500/15 text-red-300 border-red-500/30",
  cancelled: "bg-muted text-muted-foreground border-border",
  inactive: "bg-muted text-muted-foreground border-border",
};

function statusLabel(s: string) {
  const map: Record<string, string> = {
    ativa: "Ativa",
    active: "Ativa",
    pending: "Pendente",
    vencida: "Vencida",
    overdue: "Vencida",
    expired: "Expirada",
    blocked: "Bloqueada",
    suspended: "Suspensa",
    cancelled: "Cancelada",
    inactive: "Inativa",
  };
  return map[s] ?? s;
}

type PillStatus = "online" | "searching" | "cancelled" | "offline";
const STATUS_PILL: Record<string, PillStatus> = {
  ativa: "online",
  active: "online",
  pending: "searching",
  vencida: "cancelled",
  overdue: "cancelled",
  expired: "cancelled",
  blocked: "cancelled",
  suspended: "cancelled",
  cancelled: "offline",
  inactive: "offline",
};

function SubPill({ status }: { status: string }) {
  return (
    <StatusPill status={STATUS_PILL[status] ?? "offline"} label={statusLabel(status)} pulse={false} />
  );
}

function daysBetween(a: Date, b: Date) {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000);
}

function overdueDays(sub: Sub) {
  const end = sub.period_end ? new Date(sub.period_end) : null;
  if (!end) return 0;
  const d = daysBetween(new Date(), end);
  return d > 0 ? d : 0;
}

function AdminAssinaturasPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [drivers, setDrivers] = useState<Record<string, Driver>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [openSubId, setOpenSubId] = useState<string | null>(null);
  const [planToDelete, setPlanToDelete] = useState<Plan | null>(null);
  const [confirmAutoSuspend, setConfirmAutoSuspend] = useState(false);

  async function refresh() {
    setLoading(true);
    const [p, s] = await Promise.all([
      supabase.from("subscription_plans").select("*").order("created_at"),
      supabase
        .from("subscriptions")
        .select(
          "id,driver_id,plan_id,status,amount,period_start,period_end,grace_until,auto_suspend,payment_method,provider_reference,asaas_payment_id,invoice_url,paid_at,created_at,updated_at",
        )
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    if (p.error) toast.error(p.error.message);
    if (s.error) toast.error(s.error.message);
    const subRows = (s.data ?? []) as Sub[];
    setPlans((p.data ?? []) as Plan[]);
    setSubs(subRows);

    const driverIds = Array.from(new Set(subRows.map((r) => r.driver_id)));
    if (driverIds.length) {
      const { data: ds } = await supabase
        .from("drivers")
        .select(
          "id,user_id,name,phone,city,photo_url,selfie_url,asaas_customer_id,subscription_status,subscription_expires_at",
        )
        .in("id", driverIds);
      const map: Record<string, Driver> = {};
      (ds ?? []).forEach((d) => {
        map[(d as Driver).id] = d as Driver;
      });
      setDrivers(map);
    } else {
      setDrivers({});
    }
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel("admin-subs")
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscription_plans" }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const q = query.trim().toLowerCase();
    return subs.filter((s) => {
      const d = drivers[s.driver_id];
      if (filter === "ativa" && !["ativa", "active"].includes(s.status)) return false;
      if (filter === "pending" && s.status !== "pending") return false;
      if (filter === "vencida" && !["vencida", "overdue", "expired"].includes(s.status)) return false;
      if (filter === "blocked" && !["blocked", "suspended"].includes(s.status)) return false;
      if (filter === "cancelled" && s.status !== "cancelled") return false;
      if (filter === "due_today" || filter === "due_3" || filter === "due_7") {
        if (!s.period_end) return false;
        const end = new Date(s.period_end);
        end.setHours(0, 0, 0, 0);
        const days = daysBetween(end, now);
        if (filter === "due_today" && days !== 0) return false;
        if (filter === "due_3" && (days < 0 || days > 3)) return false;
        if (filter === "due_7" && (days < 0 || days > 7)) return false;
      }
      if (filter === "inadimplente" && overdueDays(s) <= 0) return false;

      if (q) {
        const hay = [
          d?.name,
          d?.phone,
          d?.city,
          d?.asaas_customer_id,
          s.asaas_payment_id,
          s.provider_reference,
          s.id,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [subs, drivers, filter, query]);

  function patchPlan(id: string, p: Partial<Plan>) {
    setPlans((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  }
  async function savePlan(p: Plan) {
    setBusyId(p.id);
    const { error } = await supabase
      .from("subscription_plans")
      .update({
        name: p.name,
        price: p.price,
        promotional_price: p.promotional_price,
        billing_cycle_days: p.billing_cycle_days,
        grace_period_days: p.grace_period_days,
        enabled: p.enabled,
      })
      .eq("id", p.id);
    setBusyId(null);
    if (error) return toast.error(error.message);
    await logAdminAction({ action: "plan.update", entity: "subscription_plans", entity_id: p.id });
    toast.success("Plano salvo");
  }
  async function createPlan() {
    const name = window.prompt("Nome do plano:")?.trim();
    if (!name) return;
    const { error } = await supabase
      .from("subscription_plans")
      .insert({ name, price: 49.9, billing_cycle_days: 30, grace_period_days: 3, enabled: true });
    if (error) return toast.error(error.message);
    await logAdminAction({ action: "plan.create", entity: "subscription_plans", after: { name } });
    toast.success("Plano criado");
  }
  async function deletePlan(p: Plan) {
    const { error } = await supabase.from("subscription_plans").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    await logAdminAction({ action: "plan.delete", entity: "subscription_plans", entity_id: p.id });
    toast.success("Plano excluído");
    refresh();
  }

  async function runAutoSuspend() {
    const { error } = await supabase.rpc("auto_suspend_overdue_subscriptions");
    if (error) return toast.error(error.message);
    toast.success("Verificação executada");
    refresh();
  }

  const activeSub = openSubId ? subs.find((s) => s.id === openSubId) ?? null : null;
  const activeDriver = activeSub ? drivers[activeSub.driver_id] ?? null : null;

  return (
    <AdminLayout
      title="Assinaturas"
      description={`${subs.length} assinaturas · ${plans.length} planos · MOVVI recebe apenas a mensalidade do motorista`}
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setConfirmAutoSuspend(true)}>
            Verificar vencidas
          </Button>
          <Button size="sm" onClick={createPlan} className="gap-1">
            <Plus className="h-4 w-4" /> Novo plano
          </Button>
        </div>
      }
    >
      {loading ? (
        <Loading label="Carregando assinaturas..." />
      ) : (
        <Tabs defaultValue="subs">
          <TabsList>
            <TabsTrigger value="subs">Assinaturas</TabsTrigger>
            <TabsTrigger value="plans">Planos</TabsTrigger>
          </TabsList>

          <TabsContent value="subs" className="mt-4 space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <DSInput
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por nome, telefone, cidade, Asaas customer/payment ID"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => {
                const active = filter === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      active
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-card/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>

            {filtered.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Nenhuma assinatura encontrada.
              </p>
            ) : (
              <div className="grid gap-2">
                {filtered.map((s) => {
                  const d = drivers[s.driver_id];
                  const plan = plans.find((p) => p.id === s.plan_id);
                  const od = overdueDays(s);
                  const mismatch =
                    d && d.subscription_status && d.subscription_status !== s.status;
                  return (
                    <Card
                      key={s.id}
                      className="cursor-pointer border-border bg-card/60 transition hover:border-primary/40 hover:bg-card"
                      onClick={() => setOpenSubId(s.id)}
                    >
                      <CardContent className="flex flex-col gap-3 p-3 md:flex-row md:items-center">
                        <Avatar className="h-11 w-11 border border-border">
                          <AvatarImage src={d?.photo_url ?? d?.selfie_url ?? undefined} />
                          <AvatarFallback className="bg-muted text-xs">
                            {d?.name?.slice(0, 2)?.toUpperCase() ?? "??"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold">
                              {d?.name ?? "Motorista"}
                            </p>
                            <SubPill status={s.status} />
                            {mismatch && (
                              <DSBadge variant="warning">
                                <AlertTriangle className="h-3 w-3" /> Status divergente
                              </DSBadge>
                            )}
                          </div>
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {plan?.name ?? "Plano"} · {formatBRL(s.amount)} · {d?.city ?? "—"} ·{" "}
                            {d?.phone ?? "—"}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            Vence {s.period_end ? formatDate(s.period_end) : "—"}
                            {od > 0 ? ` · ${od} dia(s) em atraso` : ""} · Últ. pagto{" "}
                            {s.paid_at ? formatDate(s.paid_at) : "—"} · Método{" "}
                            {s.payment_method ?? "—"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{formatBRL(s.amount)}</p>
                          <p className="text-[10px] text-muted-foreground">
                            criada {formatDate(s.created_at)}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="plans" className="mt-4 space-y-3">
            {plans.map((p) => (
              <Card key={p.id} className="border-border bg-card/60">
                <CardContent className="grid gap-3 p-4 md:grid-cols-6">
                  <Field label="Nome">
                    <DSInput value={p.name} onChange={(e) => patchPlan(p.id, { name: e.target.value })} />
                  </Field>
                  <Field label="Preço (R$)">
                    <DSInput
                      type="number"
                      step="0.01"
                      value={p.price}
                      onChange={(e) => patchPlan(p.id, { price: Number(e.target.value) || 0 })}
                    />
                  </Field>
                  <Field label="Promocional (R$)">
                    <DSInput
                      type="number"
                      step="0.01"
                      value={p.promotional_price ?? ""}
                      onChange={(e) =>
                        patchPlan(p.id, {
                          promotional_price: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                  </Field>
                  <Field label="Ciclo (dias)">
                    <DSInput
                      type="number"
                      value={p.billing_cycle_days}
                      onChange={(e) =>
                        patchPlan(p.id, { billing_cycle_days: Number(e.target.value) || 30 })
                      }
                    />
                  </Field>
                  <Field label="Tolerância (dias)">
                    <DSInput
                      type="number"
                      value={p.grace_period_days}
                      onChange={(e) =>
                        patchPlan(p.id, { grace_period_days: Number(e.target.value) || 0 })
                      }
                    />
                  </Field>
                  <div className="flex items-end justify-between gap-2">
                    <label className="flex items-center gap-2 text-xs">
                      <Switch
                        checked={p.enabled}
                        onCheckedChange={(v) => patchPlan(p.id, { enabled: v })}
                      />
                      {p.enabled ? "Ativo" : "Inativo"}
                    </label>
                    <div className="flex gap-1">
                      <Button size="sm" onClick={() => savePlan(p)} disabled={busyId === p.id}>
                        {busyId === p.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Save className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setPlanToDelete(p)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      )}

      <SubscriptionDetailSheet
        sub={activeSub}
        driver={activeDriver}
        plan={activeSub ? plans.find((p) => p.id === activeSub.plan_id) ?? null : null}
        open={!!openSubId}
        onOpenChange={(o) => !o && setOpenSubId(null)}
        onRefreshed={refresh}
      />

      <ConfirmDialog
        open={!!planToDelete}
        onOpenChange={(o) => !o && setPlanToDelete(null)}
        title="Excluir plano de assinatura?"
        description={
          <>
            Você está prestes a excluir o plano{" "}
            <strong className="text-foreground">{planToDelete?.name}</strong>. Esta ação não pode ser
            desfeita e removerá o plano do catálogo.
          </>
        }
        confirmLabel="Excluir plano"
        confirmWord="EXCLUIR"
        destructive
        onConfirm={async () => {
          if (planToDelete) await deletePlan(planToDelete);
        }}
      />

      <ConfirmDialog
        open={confirmAutoSuspend}
        onOpenChange={setConfirmAutoSuspend}
        title="Suspender assinaturas vencidas?"
        description="Todas as assinaturas expiradas com suspensão automática habilitada serão marcadas como vencidas. Motoristas com essas assinaturas ficarão bloqueados de receber corridas."
        confirmLabel="Executar verificação"
        onConfirm={async () => {
          await runAutoSuspend();
        }}
      />
    </AdminLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

type Note = { id: string; note: string; admin_user_id: string; created_at: string };

function SubscriptionDetailSheet({
  sub,
  driver,
  plan,
  open,
  onOpenChange,
  onRefreshed,
}: {
  sub: Sub | null;
  driver: Driver | null;
  plan: Plan | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onRefreshed: () => void;
}) {
  const refreshFn = useServerFn(adminRefreshAsaasPayment);
  const [refreshing, setRefreshing] = useState(false);
  const [providerStatus, setProviderStatus] = useState<string | null>(null);
  const [history, setHistory] = useState<Sub[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);

  useEffect(() => {
    setProviderStatus(null);
    setHistory([]);
    setNotes([]);
    setNoteDraft("");
    if (!sub || !driver) return;
    (async () => {
      const [h, n] = await Promise.all([
        supabase
          .from("subscriptions")
          .select(
            "id,driver_id,plan_id,status,amount,period_start,period_end,grace_until,auto_suspend,payment_method,provider_reference,asaas_payment_id,invoice_url,paid_at,created_at,updated_at",
          )
          .eq("driver_id", driver.id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("admin_subscription_notes")
          .select("id,note,admin_user_id,created_at")
          .eq("subscription_id", sub.id)
          .order("created_at", { ascending: false }),
      ]);
      setHistory(((h.data as Sub[]) ?? []) as Sub[]);
      setNotes((n.data as Note[]) ?? []);
    })();
  }, [sub, driver]);

  if (!sub) return null;

  const mismatch =
    driver && driver.subscription_status && driver.subscription_status !== sub.status;
  const od = overdueDays(sub);

  async function handleRefresh() {
    if (!sub) return;
    setRefreshing(true);
    try {
      const res = await refreshFn({ data: { subscriptionId: sub.id } });
      if (!res.ok) {
        toast.error(res.message);
        setProviderStatus(null);
      } else {
        setProviderStatus(res.providerStatus ?? "—");
        toast.success(`Status Asaas: ${res.providerStatus ?? "atualizado"}`);
        onRefreshed();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao consultar Asaas");
    } finally {
      setRefreshing(false);
    }
  }

  function copy(v: string | null | undefined, label: string) {
    if (!v) return toast.error(`${label} indisponível`);
    navigator.clipboard.writeText(v).then(
      () => toast.success(`${label} copiado`),
      () => toast.error("Falha ao copiar"),
    );
  }

  async function addNote() {
    if (!sub || !noteDraft.trim()) return;
    setSavingNote(true);
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) {
      setSavingNote(false);
      return toast.error("Sessão expirada");
    }
    const { data, error } = await supabase
      .from("admin_subscription_notes")
      .insert({ subscription_id: sub.id, admin_user_id: uid, note: noteDraft.trim() })
      .select("id,note,admin_user_id,created_at")
      .single();
    setSavingNote(false);
    if (error) return toast.error(error.message);
    setNotes((prev) => [data as Note, ...prev]);
    setNoteDraft("");
    await logAdminAction({
      action: "subscription.note",
      entity: "admin_subscription_notes",
      entity_id: sub.id,
    });
  }

  async function deleteNote(id: string) {
    const { error } = await supabase.from("admin_subscription_notes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto border-border bg-background sm:max-w-xl"
      >
        <SheetHeader>
          <SheetTitle className="text-lg">Detalhes da assinatura</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5 text-sm">
          {/* Driver summary */}
          <Card className="border-border bg-card/50">
            <CardContent className="flex items-center gap-3 p-3">
              <Avatar className="h-12 w-12 border border-border">
                <AvatarImage src={driver?.photo_url ?? driver?.selfie_url ?? undefined} />
                <AvatarFallback className="bg-muted text-xs">
                  {driver?.name?.slice(0, 2)?.toUpperCase() ?? "??"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{driver?.name ?? "—"}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {driver?.city ?? "—"} · {driver?.phone ?? "—"}
                </p>
              </div>
              <a
                href={`/admin/motoristas?driver=${driver?.id ?? ""}`}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-accent"
              >
                <UserIcon className="h-3 w-3" /> Perfil
              </a>
            </CardContent>
          </Card>

          {/* Current status */}
          <div className="grid grid-cols-2 gap-2">
            <InfoTile label="Status local" value={statusLabel(sub.status)} tone={STATUS_TONE[sub.status]} />
            <InfoTile
              label="Status motorista"
              value={driver?.subscription_status ? statusLabel(driver.subscription_status) : "—"}
              tone={
                driver?.subscription_status
                  ? STATUS_TONE[driver.subscription_status]
                  : undefined
              }
            />
            <InfoTile label="Plano" value={plan?.name ?? "—"} />
            <InfoTile label="Mensalidade" value={formatBRL(sub.amount)} />
            <InfoTile
              label="Próximo vencimento"
              value={sub.period_end ? formatDate(sub.period_end) : "—"}
            />
            <InfoTile
              label="Dias em atraso"
              value={od > 0 ? `${od} dia(s)` : "0"}
              tone={od > 0 ? "text-red-300" : undefined}
            />
            <InfoTile label="Último pagamento" value={sub.paid_at ? formatDate(sub.paid_at) : "—"} />
            <InfoTile label="Método" value={sub.payment_method ?? "—"} />
          </div>

          {mismatch && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Status divergente — verificar integração</p>
                <p className="opacity-80">
                  <code>subscriptions.status</code> ({statusLabel(sub.status)}) difere de{" "}
                  <code>drivers.subscription_status</code> ({statusLabel(driver!.subscription_status!)}
                  ). A sincronização é automática via trigger; se persistir, verifique o webhook Asaas.
                </p>
              </div>
            </div>
          )}

          {/* Asaas identifiers */}
          <Card className="border-border bg-card/50">
            <CardContent className="space-y-2 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Integração Asaas
              </p>
              <IdRow
                label="Customer ID"
                value={driver?.asaas_customer_id ?? null}
                onCopy={() => copy(driver?.asaas_customer_id, "Customer ID")}
              />
              <IdRow
                label="Payment ID"
                value={sub.asaas_payment_id ?? sub.provider_reference ?? null}
                onCopy={() =>
                  copy(sub.asaas_payment_id ?? sub.provider_reference, "Payment ID")
                }
              />
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => setConfirmRefresh(true)} disabled={refreshing}>
                  {refreshing ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1 h-3 w-3" />
                  )}
                  Verificar status
                </Button>
                {providerStatus && (
                  <DSBadge variant="muted">
                    Asaas: {providerStatus}
                  </DSBadge>
                )}
                {sub.invoice_url && (
                  <>
                    <a
                      href={sub.invoice_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-accent"
                    >
                      <ExternalLink className="h-3 w-3" /> Fatura
                    </a>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copy(sub.invoice_url, "Link da fatura")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
              <p className="pt-1 text-[10px] text-muted-foreground">
                Ativação e confirmação de pagamento só ocorrem via webhook Asaas — este painel é
                somente consulta.
              </p>
            </CardContent>
          </Card>

          {/* Payment history */}
          <div>
            <p className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              <FileText className="h-3 w-3" /> Histórico de pagamentos
            </p>
            <div className="space-y-1">
              {history.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem histórico.</p>
              ) : (
                history.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between rounded-md border border-border bg-card/40 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {h.id.slice(0, 8)}
                      </p>
                      <p className="truncate">
                        {formatDate(h.created_at)} · {h.payment_method ?? "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <SubPill status={h.status} />
                      <span className="font-semibold">{formatBRL(h.amount)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <Separator />

          {/* Notes */}
          <div>
            <p className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              <StickyNote className="h-3 w-3" /> Notas internas
            </p>
            <DSTextarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Adicionar nota interna (visível apenas para administradores)"
              rows={3}
            />
            <div className="mt-2 flex justify-end">
              <Button size="sm" onClick={addNote} disabled={savingNote || !noteDraft.trim()}>
                {savingNote ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                Adicionar nota
              </Button>
            </div>
            <div className="mt-2 space-y-1">
              {notes.map((n) => (
                <div
                  key={n.id}
                  className="flex items-start justify-between gap-2 rounded-md border border-border bg-card/40 p-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="whitespace-pre-wrap break-words">{n.note}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {formatDate(n.created_at)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => setNoteToDelete(n)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <p className="pt-2 text-[10px] text-muted-foreground">
            ID da assinatura: <span className="font-mono">{sub.id}</span> · criada em{" "}
            {formatDate(sub.created_at)}
          </p>
        </div>
      </SheetContent>

      <ConfirmDialog
        open={confirmRefresh}
        onOpenChange={setConfirmRefresh}
        title="Consultar Asaas agora?"
        description="Isso consulta o status da cobrança diretamente no provedor. O painel é somente consulta — o pagamento continua sendo confirmado apenas pelo webhook oficial."
        confirmLabel="Consultar status"
        onConfirm={handleRefresh}
      />

      <ConfirmDialog
        open={!!noteToDelete}
        onOpenChange={(o) => !o && setNoteToDelete(null)}
        title="Excluir nota interna?"
        description="A nota será removida permanentemente do histórico administrativo desta assinatura."
        confirmLabel="Excluir nota"
        destructive
        onConfirm={async () => {
          if (noteToDelete) await deleteNote(noteToDelete.id);
        }}
      />
    </Sheet>
  );
}

function InfoTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`text-sm font-medium ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

function IdRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string | null;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className="truncate font-mono">{value ?? "—"}</p>
      </div>
      <Button size="sm" variant="ghost" onClick={onCopy} disabled={!value}>
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  );
}
