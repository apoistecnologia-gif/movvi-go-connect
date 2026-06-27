import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Download, TrendingUp, Wallet, CreditCard, AlertCircle } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { formatBRL } from "@/lib/formatters";
import { downloadCsv } from "@/lib/csvExport";

export const Route = createFileRoute("/admin/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro — Admin MOVVI" }] }),
  component: AdminFinanceiroPage,
});

type Ride = { final_price: number | null; status: string; completed_at: string | null; created_at: string };
type Sub = { status: string; amount: number; created_at: string };
type Pay = { status: string; amount: number };

function AdminFinanceiroPage() {
  const [rides, setRides] = useState<Ride[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [pays, setPays] = useState<Pay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - 365);
      const [r, s, p] = await Promise.all([
        supabase
          .from("rides")
          .select("final_price,status,completed_at,created_at")
          .gte("created_at", since.toISOString())
          .limit(5000),
        supabase
          .from("subscriptions")
          .select("status,amount,created_at")
          .gte("created_at", since.toISOString())
          .limit(2000),
        supabase.from("payments").select("status,amount").limit(2000),
      ]);
      if (!alive) return;
      setRides((r.data ?? []) as Ride[]);
      setSubs((s.data ?? []) as Sub[]);
      setPays((p.data ?? []) as Pay[]);
      setLoading(false);
    })();
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const startToday = new Date(now);
    startToday.setHours(0, 0, 0, 0);
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startYear = new Date(now.getFullYear(), 0, 1);
    const finalized = rides.filter((r) => r.status === "finalizada" && r.final_price);
    const sum = (arr: Ride[]) => arr.reduce((acc, r) => acc + (r.final_price ?? 0), 0);
    return {
      today: sum(finalized.filter((r) => new Date(r.completed_at ?? r.created_at) >= startToday)),
      month: sum(finalized.filter((r) => new Date(r.completed_at ?? r.created_at) >= startMonth)),
      year: sum(finalized.filter((r) => new Date(r.completed_at ?? r.created_at) >= startYear)),
      subActive: subs.filter((s) => s.status === "ativa").length,
      subOverdue: subs.filter((s) => s.status === "vencida").length,
      payPending: pays.filter((p) => p.status === "pendente" || p.status === "pending").reduce((a, b) => a + b.amount, 0),
    };
  }, [rides, subs, pays]);

  const daily = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      map.set(d.toISOString().slice(0, 10), 0);
    }
    for (const r of rides) {
      if (r.status !== "finalizada" || !r.final_price) continue;
      const day = (r.completed_at ?? r.created_at).slice(0, 10);
      if (map.has(day)) map.set(day, (map.get(day) ?? 0) + r.final_price);
    }
    return Array.from(map.entries()).map(([day, value]) => ({ day: day.slice(5), value: Math.round(value) }));
  }, [rides]);

  function exportCsv() {
    downloadCsv(`financeiro-${new Date().toISOString().slice(0, 10)}`, daily);
  }

  if (loading) {
    return (
      <AdminLayout title="Financeiro">
        <div className="grid place-items-center py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Financeiro"
      description="Receita, assinaturas e pagamentos"
      actions={
        <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1">
          <Download className="h-4 w-4" /> CSV
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Receita hoje" value={formatBRL(stats.today)} />
        <Kpi icon={<Wallet className="h-4 w-4" />} label="Receita mês" value={formatBRL(stats.month)} />
        <Kpi icon={<Wallet className="h-4 w-4" />} label="Receita ano" value={formatBRL(stats.year)} />
        <Kpi icon={<CreditCard className="h-4 w-4" />} label="Assinaturas ativas" value={String(stats.subActive)} />
        <Kpi icon={<AlertCircle className="h-4 w-4" />} label="Assin. vencidas" value={String(stats.subOverdue)} />
        <Kpi icon={<AlertCircle className="h-4 w-4" />} label="Pgto pendente" value={formatBRL(stats.payPending)} />
      </div>

      <Card className="mt-4 border-border bg-card/60">
        <CardHeader>
          <CardTitle className="text-base">Receita diária (últimos 30 dias)</CardTitle>
        </CardHeader>
        <CardContent style={{ height: 320 }}>
          <ResponsiveContainer>
            <BarChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
              <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                formatter={(v: number) => formatBRL(v)}
              />
              <Bar dataKey="value" fill="#8DD92B" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </AdminLayout>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="border-border bg-card/60">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
          {icon} {label}
        </div>
        <p className="mt-2 text-xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
