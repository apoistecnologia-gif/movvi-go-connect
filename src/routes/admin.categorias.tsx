import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Save, ShieldCheck } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import {
  DSButton as Button,
  DSCard as Card,
  DSCardContent as CardContent,
  DSInput,
  Loading,
} from "@/design-system";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ICON_REGISTRY } from "@/lib/uiCategories";
import { updateAdminRideCategory } from "@/lib/adminControlPlane";

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

const ICON_NAMES = Object.keys(ICON_REGISTRY);

function AdminCategoriasPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const { data, error } = await (supabase as any)
        .from("ride_categories")
        .select("id,code,name,description,icon,image_url,capacity_label,eta_label,sort_order,is_active")
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
    void refresh();
    const channel = supabase
      .channel("admin-ride-categories-canonical")
      .on("postgres_changes", { event: "*", schema: "public", table: "ride_categories" }, () => void refresh())
      .subscribe();
    return () => {
      alive = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  function patch(id: string, next: Partial<Row>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...next } : row)));
  }

  async function save(row: Row) {
    setSavingId(row.id);
    try {
      await updateAdminRideCategory({
        id: row.id,
        name: row.name,
        description: row.description,
        icon: row.icon,
        imageUrl: row.image_url,
        capacityLabel: row.capacity_label,
        etaLabel: row.eta_label,
        sortOrder: row.sort_order,
        isActive: row.is_active,
      });
      toast.success(`${row.name} atualizada`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a categoria.");
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
        <Loading label="Carregando categorias..." />
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p>
              Os códigos <strong>carros, motos, fretes, guincho e envios</strong> fazem parte do contrato da corrida.
              Por segurança, o painel não cria nem exclui códigos arbitrários; ele controla apresentação, ordem e disponibilidade.
            </p>
          </div>

          <div className="grid gap-3">
            {rows.map((row) => (
              <Card key={row.id} className="border-border bg-card/60">
                <CardContent className="space-y-4 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Código canônico</p>
                      <p className="font-mono text-sm font-semibold text-primary">{row.code}</p>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-medium">
                      <Switch
                        checked={row.is_active}
                        onCheckedChange={(value) => patch(row.id, { is_active: value })}
                      />
                      {row.is_active ? "Ativa" : "Desativada"}
                    </label>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <Field label="Nome">
                      <DSInput value={row.name} onChange={(e) => patch(row.id, { name: e.target.value })} />
                    </Field>
                    <Field label="Descrição">
                      <DSInput value={row.description ?? ""} onChange={(e) => patch(row.id, { description: e.target.value || null })} />
                    </Field>
                    <Field label="Ícone">
                      <select
                        value={row.icon ?? ICON_NAMES[0] ?? "Car"}
                        onChange={(e) => patch(row.id, { icon: e.target.value })}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        {ICON_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}
                      </select>
                    </Field>
                    <Field label="Capacidade">
                      <DSInput value={row.capacity_label ?? ""} onChange={(e) => patch(row.id, { capacity_label: e.target.value || null })} />
                    </Field>
                    <Field label="ETA exibido">
                      <DSInput value={row.eta_label ?? ""} onChange={(e) => patch(row.id, { eta_label: e.target.value || null })} />
                    </Field>
                    <Field label="Ordem">
                      <DSInput
                        type="number"
                        min={0}
                        max={9999}
                        value={row.sort_order}
                        onChange={(e) => patch(row.id, { sort_order: Number(e.target.value) || 0 })}
                      />
                    </Field>
                    <Field label="Imagem (URL/path)">
                      <DSInput value={row.image_url ?? ""} onChange={(e) => patch(row.id, { image_url: e.target.value || null })} />
                    </Field>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={() => void save(row)} disabled={savingId === row.id} className="gap-2">
                      {savingId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Salvar categoria
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
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
