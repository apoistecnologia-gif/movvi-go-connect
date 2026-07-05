import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Plus, Loader2, Trash2, Save } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import {
  DSButton as Button,
  DSCard as Card,
  DSCardContent as CardContent,
  Loading,
  EmptyState,
} from "@/design-system";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
// Badge legacy substituído por tag inline abaixo.
import { toast } from "sonner";
import { logAdminAction } from "@/lib/adminAudit";
import { formatDate } from "@/lib/formatters";
import {
  createCoupon,
  updateCoupon,
  setCouponEnabled,
  deleteCoupon,
} from "@/lib/adminCoupons.functions";

function mapAdminError(msg: string): string {
  if (msg === "forbidden") return "Ação restrita a administradores.";
  if (/invalid_|^Required$|uuid/i.test(msg)) return "Dados inválidos.";
  return msg;
}

export const Route = createFileRoute("/admin/cupons")({
  head: () => ({ meta: [{ title: "Promoções — Admin MOVVI" }] }),
  component: AdminCuponsPage,
});

type Coupon = {
  id: string;
  code: string;
  description: string | null;
  type: string;
  value: number;
  max_discount: number | null;
  valid_from: string | null;
  valid_to: string | null;
  usage_limit: number | null;
  used_count: number;
  scope_category: string | null;
  enabled: boolean;
  created_at: string;
};

const TYPES = [
  { value: "percent", label: "Percentual (%)" },
  { value: "fixed", label: "Valor fixo (R$)" },
  { value: "first_ride", label: "Primeira corrida" },
  { value: "free_delivery", label: "Frete grátis" },
];

function AdminCuponsPage() {
  const createFn = useServerFn(createCoupon);
  const updateFn = useServerFn(updateCoupon);
  const toggleFn = useServerFn(setCouponEnabled);
  const deleteFn = useServerFn(deleteCoupon);
  const [rows, setRows] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const { data, error } = await supabase
      .from("coupons")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data ?? []) as Coupon[]);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel("admin-coupons")
      .on("postgres_changes", { event: "*", schema: "public", table: "coupons" }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  function patch(id: string, p: Partial<Coupon>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  }

  async function save(c: Coupon) {
    setBusyId(c.id);
    try {
      await updateFn({
        data: {
          id: c.id,
          code: c.code.toUpperCase(),
          description: c.description,
          type: c.type,
          value: Number(c.value) || 0,
          max_discount: c.max_discount,
          valid_from: c.valid_from,
          valid_to: c.valid_to,
          usage_limit: c.usage_limit,
          scope_category: c.scope_category,
          enabled: c.enabled,
        },
      });
      await logAdminAction({ action: "coupon.update", entity: "coupons", entity_id: c.id });
      toast.success("Cupom salvo");
    } catch (e) {
      toast.error(e instanceof Error ? mapAdminError(e.message) : String(e));
    } finally {
      setBusyId(null);
    }
  }
  async function toggle(c: Coupon, enabled: boolean) {
    patch(c.id, { enabled });
    try {
      await toggleFn({ data: { id: c.id, enabled } });
      await logAdminAction({
        action: enabled ? "coupon.enable" : "coupon.disable",
        entity: "coupons",
        entity_id: c.id,
      });
    } catch (e) {
      patch(c.id, { enabled: !enabled });
      toast.error(e instanceof Error ? mapAdminError(e.message) : String(e));
    }
  }
  async function del(c: Coupon) {
    if (!confirm(`Excluir cupom ${c.code}?`)) return;
    try {
      await deleteFn({ data: { id: c.id } });
      await logAdminAction({
        action: "coupon.delete",
        entity: "coupons",
        entity_id: c.id,
        before: { code: c.code },
      });
      toast.success("Excluído");
    } catch (e) {
      toast.error(e instanceof Error ? mapAdminError(e.message) : String(e));
    }
  }
  async function create() {
    const code = prompt("Código (ex: BEMVINDO20):")?.trim().toUpperCase();
    if (!code) return;
    try {
      await createFn({ data: { code } });
      await logAdminAction({ action: "coupon.create", entity: "coupons", after: { code } });
      toast.success("Criado");
    } catch (e) {
      toast.error(e instanceof Error ? mapAdminError(e.message) : String(e));
    }
  }

  return (
    <AdminLayout
      title="Promoções e Cupons"
      description={`${rows.length} cupons`}
      actions={
        <Button onClick={create} className="gap-1" size="sm">
          <Plus className="h-4 w-4" /> Novo cupom
        </Button>
      }
    >
      {loading ? (
        <div className="grid place-items-center py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Nenhum cupom cadastrado.</p>
      ) : (
        <div className="grid gap-3">
          {rows.map((c) => (
            <Card key={c.id} className="border-border bg-card/60">
              <CardContent className="grid gap-3 p-4 md:grid-cols-6">
                <Field label="Código">
                  <Input value={c.code} onChange={(e) => patch(c.id, { code: e.target.value.toUpperCase() })} />
                </Field>
                <Field label="Tipo">
                  <select
                    value={c.type}
                    onChange={(e) => patch(c.id, { type: e.target.value })}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Valor">
                  <Input
                    type="number"
                    step="0.01"
                    value={c.value}
                    onChange={(e) => patch(c.id, { value: Number(e.target.value) || 0 })}
                  />
                </Field>
                <Field label="Desc. máximo (R$)">
                  <Input
                    type="number"
                    step="0.01"
                    value={c.max_discount ?? ""}
                    onChange={(e) => patch(c.id, { max_discount: e.target.value ? Number(e.target.value) : null })}
                  />
                </Field>
                <Field label="Limite de uso">
                  <Input
                    type="number"
                    value={c.usage_limit ?? ""}
                    onChange={(e) => patch(c.id, { usage_limit: e.target.value ? Number(e.target.value) : null })}
                  />
                </Field>
                <Field label="Categoria (opcional)">
                  <Input
                    value={c.scope_category ?? ""}
                    onChange={(e) => patch(c.id, { scope_category: e.target.value || null })}
                  />
                </Field>
                <Field label="Validade (até)">
                  <Input
                    type="datetime-local"
                    value={c.valid_to ? c.valid_to.slice(0, 16) : ""}
                    onChange={(e) =>
                      patch(c.id, { valid_to: e.target.value ? new Date(e.target.value).toISOString() : null })
                    }
                  />
                </Field>
                <Field label="Descrição">
                  <Input
                    value={c.description ?? ""}
                    onChange={(e) => patch(c.id, { description: e.target.value })}
                  />
                </Field>
                <div className="md:col-span-4 flex items-end justify-between">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <Badge variant="outline">Usos: {c.used_count}/{c.usage_limit ?? "∞"}</Badge>
                    <span>Criado {formatDate(c.created_at)}</span>
                    <label className="flex items-center gap-2">
                      <Switch checked={c.enabled} onCheckedChange={(v) => toggle(c, v)} />
                      {c.enabled ? "Ativo" : "Desativado"}
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => save(c)} disabled={busyId === c.id} className="gap-1">
                      {busyId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      Salvar
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del(c)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
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
