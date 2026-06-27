import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Save, Trash2, GripVertical, Loader2 } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { logAdminAction } from "@/lib/adminAudit";
import { ICON_REGISTRY } from "@/lib/uiCategories";

export const Route = createFileRoute("/admin/categorias")({
  head: () => ({ meta: [{ title: "Categorias — Admin MOVVI" }] }),
  component: AdminCategoriasPage,
});

type Row = {
  id: string;
  key: string;
  label: string;
  icon: string;
  color: string;
  enabled: boolean;
  sort_order: number;
};

const ICON_NAMES = Object.keys(ICON_REGISTRY);

function AdminCategoriasPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const { data, error } = await supabase
        .from("ride_categories")
        .select("id,key,label,icon,color,enabled,sort_order")
        .order("sort_order", { ascending: true });
      if (!alive) return;
      if (error) {
        toast.error("Falha ao carregar categorias: " + error.message);
        setLoading(false);
        return;
      }
      setRows((data ?? []) as Row[]);
      setLoading(false);
    };
    refresh();
    const channel = supabase
      .channel("admin-ride-categories")
      .on("postgres_changes", { event: "*", schema: "public", table: "ride_categories" }, refresh)
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, []);

  function patch(id: string, p: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  }

  async function saveRow(row: Row) {
    setSavingId(row.id);
    const { error } = await supabase
      .from("ride_categories")
      .update({
        label: row.label,
        icon: row.icon,
        color: row.color,
        enabled: row.enabled,
        sort_order: row.sort_order,
      })
      .eq("id", row.id);
    setSavingId(null);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    await logAdminAction({ action: "ride_category.update", entity: "ride_categories", entity_id: row.id, after: { key: row.key } });
    toast.success(`"${row.label}" atualizada`);
  }

  async function toggleEnabled(row: Row, enabled: boolean) {
    patch(row.id, { enabled });
    const { error } = await supabase
      .from("ride_categories")
      .update({ enabled })
      .eq("id", row.id);
    if (error) {
      toast.error("Falha ao alternar: " + error.message);
      patch(row.id, { enabled: !enabled });
      return;
    }
    await logAdminAction({ action: enabled ? "ride_category.enable" : "ride_category.disable", entity: "ride_categories", entity_id: row.id });
    toast.success(`${row.label} ${enabled ? "habilitada" : "desabilitada"}`);
  }

  async function deleteRow(row: Row) {
    if (!confirm(`Excluir categoria "${row.label}"? Esta ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from("ride_categories").delete().eq("id", row.id);
    if (error) {
      toast.error("Erro ao excluir: " + error.message);
      return;
    }
    await logAdminAction({ action: "ride_category.delete", entity: "ride_categories", entity_id: row.id, before: { key: row.key } });
    toast.success("Categoria excluída");
  }

  async function createNew() {
    const key = prompt("Chave única (ex: carros, motos, fretes, guincho, envios):")?.trim().toLowerCase();
    if (!key) return;
    const label = prompt("Nome exibido:")?.trim();
    if (!label) return;
    const sort = (rows.at(-1)?.sort_order ?? 0) + 1;
    const { error } = await supabase
      .from("ride_categories")
      .insert({ key, label, icon: "Car", color: "#8DD92B", enabled: true, sort_order: sort });
    if (error) {
      toast.error("Erro ao criar: " + error.message);
      return;
    }
    await logAdminAction({ action: "ride_category.create", entity: "ride_categories", after: { key, label } });
    toast.success("Categoria criada");
  }

  async function reorder(row: Row, dir: -1 | 1) {
    const idx = rows.findIndex((r) => r.id === row.id);
    const swap = rows[idx + dir];
    if (!swap) return;
    await Promise.all([
      supabase.from("ride_categories").update({ sort_order: swap.sort_order }).eq("id", row.id),
      supabase.from("ride_categories").update({ sort_order: row.sort_order }).eq("id", swap.id),
    ]);
  }

  return (
    <AdminLayout
      title="Categorias de Corrida"
      description="Habilite, renomeie, defina ícone e cor de cada categoria — mudanças aparecem no app em tempo real."
      actions={
        <Button onClick={createNew} className="gap-2">
          <Plus className="h-4 w-4" /> Nova
        </Button>
      }
    >
      {loading ? (
        <div className="grid place-items-center py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map((row, idx) => (
            <Card key={row.id} className="border-border bg-card/60">
              <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    title="Mover para cima"
                    disabled={idx === 0}
                    onClick={() => reorder(row, -1)}
                    className="rounded p-1 text-muted-foreground hover:bg-accent/40 disabled:opacity-30"
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                  <span
                    className="grid h-12 w-12 place-items-center rounded-xl text-white shadow"
                    style={{ backgroundColor: row.color }}
                  >
                    <span className="text-xs font-bold">{row.icon.slice(0, 2)}</span>
                  </span>
                </div>

                <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-4">
                  <Field label="Chave">
                    <Input value={row.key} disabled />
                  </Field>
                  <Field label="Nome">
                    <Input value={row.label} onChange={(e) => patch(row.id, { label: e.target.value })} />
                  </Field>
                  <Field label="Ícone">
                    <select
                      value={row.icon}
                      onChange={(e) => patch(row.id, { icon: e.target.value })}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {ICON_NAMES.map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Cor">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={row.color}
                        onChange={(e) => patch(row.id, { color: e.target.value })}
                        className="h-9 w-12 cursor-pointer rounded border border-input bg-background"
                      />
                      <Input
                        value={row.color}
                        onChange={(e) => patch(row.id, { color: e.target.value })}
                        className="flex-1"
                      />
                    </div>
                  </Field>
                </div>

                <div className="flex items-center gap-3 md:flex-col md:items-end">
                  <label className="flex items-center gap-2 text-xs">
                    <Switch
                      checked={row.enabled}
                      onCheckedChange={(v) => toggleEnabled(row, v)}
                    />
                    {row.enabled ? "Ativa" : "Desativada"}
                  </label>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => saveRow(row)}
                      disabled={savingId === row.id}
                      className="gap-1"
                    >
                      {savingId === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      Salvar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteRow(row)} className="text-destructive gap-1">
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
