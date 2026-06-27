import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, Loader2, FileBarChart } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { downloadCsv } from "@/lib/csvExport";
import { logAdminAction } from "@/lib/adminAudit";

export const Route = createFileRoute("/admin/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — Admin MOVVI" }] }),
  component: AdminRelatoriosPage,
});

type ReportKey = "drivers" | "passengers" | "rides" | "revenue" | "subscriptions" | "categories";

const REPORTS: { key: ReportKey; label: string; description: string; table: string; columns: string }[] = [
  { key: "drivers", label: "Motoristas", description: "Cadastro, status, avaliação", table: "drivers", columns: "id,name,email,phone,city,category,approval_status,subscription_status,is_online,rating,created_at" },
  { key: "passengers", label: "Passageiros", description: "Cadastro e atividade", table: "users", columns: "id,name,email,phone,city,created_at,last_login_at,suspended_at,blocked_at" },
  { key: "rides", label: "Corridas", description: "Todas as corridas com valores", table: "rides", columns: "id,passenger_id,driver_id,category,status,origin_name,destination_name,distance_km,duration_min,estimated_price,final_price,payment_method,created_at,completed_at" },
  { key: "revenue", label: "Receita (concluídas)", description: "Apenas corridas finalizadas", table: "rides", columns: "id,category,final_price,payment_method,completed_at" },
  { key: "subscriptions", label: "Assinaturas", description: "Status e vigência", table: "subscriptions", columns: "id,driver_id,status,amount,period_start,period_end,grace_until,auto_suspend,created_at" },
  { key: "categories", label: "Categorias", description: "Configuração de categorias", table: "ride_categories", columns: "key,label,icon,color,enabled,sort_order" },
];

function AdminRelatoriosPage() {
  const [busy, setBusy] = useState<ReportKey | null>(null);

  async function generate(r: (typeof REPORTS)[number]) {
    setBusy(r.key);
    let q = supabase.from(r.table as never).select(r.columns).limit(10000);
    if (r.key === "revenue") q = (q as never as { eq: (k: string, v: string) => typeof q }).eq("status", "finalizada");
    const { data, error } = await q;
    setBusy(null);
    if (error) return toast.error(error.message);
    if (!data || data.length === 0) return toast.info("Nenhum dado encontrado");
    downloadCsv(`${r.key}-${new Date().toISOString().slice(0, 10)}`, data as Record<string, unknown>[]);
    await logAdminAction({ action: "report.export", entity: r.table, after: { rows: data.length } });
    toast.success(`${data.length} linhas exportadas`);
  }

  return (
    <AdminLayout title="Relatórios" description="Exporte dados em CSV (abre direto no Excel)">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <Card key={r.key} className="border-border bg-card/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileBarChart className="h-4 w-4 text-primary" /> {r.label}
              </CardTitle>
              <p className="text-xs text-muted-foreground">{r.description}</p>
            </CardHeader>
            <CardContent>
              <Button onClick={() => generate(r)} disabled={busy === r.key} className="w-full gap-2">
                {busy === r.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Gerar CSV
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </AdminLayout>
  );
}
