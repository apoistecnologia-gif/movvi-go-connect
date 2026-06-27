import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Loader2, Save, Trash2, Pause } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { logAdminAction } from "@/lib/adminAudit";
import { formatBRL, formatDate } from "@/lib/formatters";

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
  status: string;
  amount: number;
  period_end: string | null;
  grace_until: string | null;
  auto_suspend: boolean;
  created_at: string;
};

function AdminAssinaturasPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const [p, s] = await Promise.all([
      supabase.from("subscription_plans").select("*").order("created_at"),
      supabase.from("subscriptions").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    if (p.error) toast.error(p.error.message);
    if (s.error) toast.error(s.error.message);
    setPlans((p.data ?? []) as Plan[]);
    setSubs((s.data ?? []) as Sub[]);
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
  }, []);

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
    const name = prompt("Nome do plano:")?.trim();
    if (!name) return;
    const { error } = await supabase
      .from("subscription_plans")
      .insert({ name, price: 99.9, billing_cycle_days: 30, grace_period_days: 3, enabled: true });
    if (error) return toast.error(error.message);
    await logAdminAction({ action: "plan.create", entity: "subscription_plans", after: { name } });
    toast.success("Plano criado");
  }
  async function deletePlan(p: Plan) {
    if (!confirm(`Excluir plano "${p.name}"?`)) return;
    const { error } = await supabase.from("subscription_plans").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    await logAdminAction({ action: "plan.delete", entity: "subscription_plans", entity_id: p.id });
  }
  async function suspendSub(s: Sub) {
    if (!confirm("Suspender essa assinatura?")) return;
    const { error } = await supabase.from("subscriptions").update({ status: "vencida" }).eq("id", s.id);
    if (error) return toast.error(error.message);
    await supabase.from("drivers").update({ subscription_status: "vencida" }).eq("id", s.driver_id);
    await logAdminAction({ action: "subscription.suspend", entity: "subscriptions", entity_id: s.id });
    toast.success("Assinatura suspensa");
  }
  async function runAutoSuspend() {
    const { error } = await supabase.rpc("auto_suspend_overdue_subscriptions");
    if (error) return toast.error(error.message);
    toast.success("Verificação executada");
    refresh();
  }

  return (
    <AdminLayout
      title="Assinaturas"
      description={`${plans.length} planos · ${subs.length} assinaturas`}
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={runAutoSuspend}>
            Verificar vencidas
          </Button>
          <Button size="sm" onClick={createPlan} className="gap-1">
            <Plus className="h-4 w-4" /> Novo plano
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="grid place-items-center py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <Tabs defaultValue="plans">
          <TabsList>
            <TabsTrigger value="plans">Planos</TabsTrigger>
            <TabsTrigger value="subs">Assinaturas ativas</TabsTrigger>
          </TabsList>
          <TabsContent value="plans" className="mt-4 space-y-3">
            {plans.map((p) => (
              <Card key={p.id} className="border-border bg-card/60">
                <CardContent className="grid gap-3 p-4 md:grid-cols-6">
                  <Field label="Nome">
                    <Input value={p.name} onChange={(e) => patchPlan(p.id, { name: e.target.value })} />
                  </Field>
                  <Field label="Preço (R$)">
                    <Input
                      type="number"
                      step="0.01"
                      value={p.price}
                      onChange={(e) => patchPlan(p.id, { price: Number(e.target.value) || 0 })}
                    />
                  </Field>
                  <Field label="Promocional (R$)">
                    <Input
                      type="number"
                      step="0.01"
                      value={p.promotional_price ?? ""}
                      onChange={(e) =>
                        patchPlan(p.id, { promotional_price: e.target.value ? Number(e.target.value) : null })
                      }
                    />
                  </Field>
                  <Field label="Ciclo (dias)">
                    <Input
                      type="number"
                      value={p.billing_cycle_days}
                      onChange={(e) => patchPlan(p.id, { billing_cycle_days: Number(e.target.value) || 30 })}
                    />
                  </Field>
                  <Field label="Tolerância (dias)">
                    <Input
                      type="number"
                      value={p.grace_period_days}
                      onChange={(e) => patchPlan(p.id, { grace_period_days: Number(e.target.value) || 0 })}
                    />
                  </Field>
                  <div className="flex items-end justify-between gap-2">
                    <label className="flex items-center gap-2 text-xs">
                      <Switch checked={p.enabled} onCheckedChange={(v) => patchPlan(p.id, { enabled: v })} />
                      {p.enabled ? "Ativo" : "Inativo"}
                    </label>
                    <div className="flex gap-1">
                      <Button size="sm" onClick={() => savePlan(p)} disabled={busyId === p.id}>
                        {busyId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deletePlan(p)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
          <TabsContent value="subs" className="mt-4 space-y-2">
            {subs.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma assinatura.</p>
            ) : (
              subs.map((s) => (
                <Card key={s.id} className="border-border bg-card/60">
                  <CardContent className="flex flex-col gap-2 p-3 md:flex-row md:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs">{s.id.slice(0, 8)} · motorista {s.driver_id.slice(0, 8)}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Vence em {s.period_end ? formatDate(s.period_end) : "—"} ·
                        {s.grace_until ? ` tolerância até ${formatDate(s.grace_until)}` : ""}
                      </p>
                    </div>
                    <Badge variant={s.status === "ativa" ? "default" : "destructive"}>{s.status}</Badge>
                    <span className="text-sm font-semibold">{formatBRL(s.amount)}</span>
                    {s.status === "ativa" && (
                      <Button size="sm" variant="ghost" onClick={() => suspendSub(s)} className="gap-1 text-destructive">
                        <Pause className="h-3 w-3" /> Suspender
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      )}
    </AdminLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
