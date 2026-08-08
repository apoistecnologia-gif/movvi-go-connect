import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, FileBarChart, Loader2 } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { downloadCsv } from "@/lib/csvExport";
import { DSButton, DSCard, DSCardContent, DSCardHeader, DSCardTitle } from "@/design-system";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — Admin APOIS" }] }),
  component: AdminRelatoriosPage,
});

type ReportKey = "drivers" | "passengers" | "rides" | "settlements" | "withdrawals" | "categories" | "support";

type ReportDef = {
  key: ReportKey;
  label: string;
  description: string;
  load: () => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
};

function AdminRelatoriosPage() {
  const [busy, setBusy] = useState<ReportKey | null>(null);

  const reports: ReportDef[] = [
    {
      key: "drivers",
      label: "Motoristas",
      description: "Cadastro, aprovação, assinatura, presença e avaliação.",
      load: async () => supabase.from("drivers").select("id,user_id,name,email,phone,city,state,category,approval_status,documents_status,subscription_status,is_online,rating,total_ratings,created_at,updated_at").limit(10000),
    },
    {
      key: "passengers",
      label: "Passageiros",
      description: "Cadastro e estado operacional canônico.",
      load: async () => supabase.from("users").select("id,auth_user_id,name,email,phone,city,average_rating,total_ratings,completed_rides,blocked_at,block_reason,suspended_at,deleted_at,created_at,updated_at").limit(10000),
    },
    {
      key: "rides",
      label: "Corridas",
      description: "Ciclo de vida, rota, preço e pagamento declarado.",
      load: async () => supabase.from("rides").select("id,passenger_id,driver_id,category,status,origin_name,destination_name,distance_km,duration_min,estimated_price,final_price,payment_method,dispatch_attempts,accepted_at,driver_arrived_at,started_at,completed_at,cancelled_at,created_at").limit(10000),
    },
    {
      key: "settlements",
      label: "Settlements",
      description: "GMV, ganhos do motorista, receita APOIS, taxas e estornos.",
      load: async () => supabase.from("ride_settlements").select("id,ride_id,passenger_id,driver_id,passenger_charge_cents,driver_earning_cents,platform_fee_cents,payment_provider_fee_cents,refunded_amount_cents,payment_method,payment_status,status,created_at,settled_at").limit(10000),
    },
    {
      key: "withdrawals",
      label: "Saques de motoristas",
      description: "Solicitações, processamento e resultado de payout.",
      load: async () => supabase.from("driver_withdrawals").select("id,driver_id,amount,status,provider,provider_transfer_id,failure_reason,requested_at,processed_at,updated_at").limit(10000),
    },
    {
      key: "categories",
      label: "Categorias",
      description: "Domínio comercial oficial das categorias de corrida.",
      load: async () => supabase.from("ride_categories").select("id,code,name,description,capacity_label,eta_label,sort_order,is_active,created_at,updated_at").limit(1000),
    },
    {
      key: "support",
      label: "Suporte passageiro",
      description: "Tickets reais da entidade passenger_support_tickets.",
      load: async () => supabase.from("passenger_support_tickets").select("id,protocol,passenger_id,ride_id,category,subject,status,priority,created_at,updated_at").limit(10000),
    },
  ];

  async function generate(report: ReportDef) {
    setBusy(report.key);
    try {
      const { data, error } = await report.load();
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Record<string, unknown>[];
      if (!rows.length) return toast.info("Nenhum dado encontrado.");
      downloadCsv(`apois-${report.key}-${new Date().toISOString().slice(0, 10)}`, rows);
      toast.success(`${rows.length} linha(s) exportada(s).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o relatório.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminLayout title="Relatórios" description="Exportações CSV das entidades canônicas do APOIS Corridas">
      <DSCard className="mb-4 border-primary/20 bg-primary/5">
        <DSCardContent className="p-4 text-sm text-muted-foreground">
          Relatórios financeiros usam <strong>ride_settlements</strong> e <strong>driver_withdrawals</strong>. O painel não chama valor bruto de corrida de receita APOIS e não exporta tabelas legadas de assinatura.
        </DSCardContent>
      </DSCard>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {reports.map((report) => (
          <DSCard key={report.key}>
            <DSCardHeader>
              <DSCardTitle className="flex items-center gap-2 text-base"><FileBarChart className="h-4 w-4 text-primary" /> {report.label}</DSCardTitle>
              <p className="text-xs text-muted-foreground">{report.description}</p>
            </DSCardHeader>
            <DSCardContent>
              <DSButton onClick={() => void generate(report)} disabled={busy === report.key} className="w-full gap-2">
                {busy === report.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Gerar CSV
              </DSButton>
            </DSCardContent>
          </DSCard>
        ))}
      </div>
    </AdminLayout>
  );
}
