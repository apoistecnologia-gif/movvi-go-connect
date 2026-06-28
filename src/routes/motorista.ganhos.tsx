import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Calendar, Clock, DollarSign, Download, FileText, Loader2, MapPin, TrendingUp,
} from "lucide-react";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, DRIVER_NAV } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { downloadCsv } from "@/lib/csvExport";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/motorista/ganhos")({
  head: () => ({ meta: [{ title: "Ganhos — MOVVI DRIVE" }] }),
  component: DriverEarningsPage,
});

type Filter = "today" | "yesterday" | "week" | "month" | "custom";

type Ride = {
  id: string;
  created_at: string;
  completed_at: string | null;
  origin_name: string;
  destination_name: string;
  distance_km: number | null;
  duration_min: number | null;
  final_price: number | null;
  estimated_price: number | null;
  payment_method: string | null;
  category: string | null;
};

function range(filter: Filter, customFrom: string, customTo: string): [Date, Date] {
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  if (filter === "today") return [start, end];
  if (filter === "yesterday") {
    const s = new Date(start); s.setDate(s.getDate() - 1);
    const e = new Date(end); e.setDate(e.getDate() - 1);
    return [s, e];
  }
  if (filter === "week") {
    const s = new Date(start); s.setDate(s.getDate() - 6);
    return [s, end];
  }
  if (filter === "month") {
    const s = new Date(start); s.setDate(1);
    return [s, end];
  }
  return [
    customFrom ? new Date(customFrom + "T00:00:00") : start,
    customTo ? new Date(customTo + "T23:59:59") : end,
  ];
}

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function DriverEarningsPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalAll, setTotalAll] = useState({ earnings: 0, trips: 0, distance: 0 });

  useEffect(() => {
    (async () => {
      const { data: a } = await supabase.auth.getUser();
      if (!a?.user) { navigate({ to: "/motorista/login" }); return; }
      setUserId(a.user.id);
    })();
  }, [navigate]);

  useEffect(() => {
    if (!userId) return;
    const [from, to] = range(filter, customFrom, customTo);
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("rides")
        .select("id,created_at,completed_at,origin_name,destination_name,distance_km,duration_min,final_price,estimated_price,payment_method,category")
        .eq("driver_id", userId).eq("status", "finalizada")
        .gte("completed_at", from.toISOString())
        .lte("completed_at", to.toISOString())
        .order("completed_at", { ascending: false });
      if (!error) setRides((data ?? []) as Ride[]);

      const { data: tot } = await supabase
        .from("rides")
        .select("final_price,distance_km")
        .eq("driver_id", userId).eq("status", "finalizada");
      const e = (tot ?? []).reduce((s, r) => s + Number(r.final_price ?? 0), 0);
      const km = (tot ?? []).reduce((s, r) => s + Number(r.distance_km ?? 0), 0);
      setTotalAll({ earnings: e, trips: tot?.length ?? 0, distance: km });
      setLoading(false);
    })();
  }, [userId, filter, customFrom, customTo]);

  const stats = useMemo(() => {
    const earnings = rides.reduce((s, r) => s + Number(r.final_price ?? r.estimated_price ?? 0), 0);
    const trips = rides.length;
    const distance = rides.reduce((s, r) => s + Number(r.distance_km ?? 0), 0);
    const duration = rides.reduce((s, r) => s + Number(r.duration_min ?? 0), 0);
    const avgFare = trips ? earnings / trips : 0;
    const perKm = distance ? earnings / distance : 0;
    return { earnings, trips, distance, duration, avgFare, perKm };
  }, [rides]);

  const chartData = useMemo(() => {
    const map = new Map<string, { day: string; ganhos: number; corridas: number }>();
    rides.forEach((r) => {
      const d = new Date(r.completed_at ?? r.created_at);
      const key = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      const cur = map.get(key) ?? { day: key, ganhos: 0, corridas: 0 };
      cur.ganhos += Number(r.final_price ?? r.estimated_price ?? 0);
      cur.corridas += 1;
      map.set(key, cur);
    });
    return Array.from(map.values()).reverse();
  }, [rides]);

  function exportCsv() {
    downloadCsv(
      `movvi-ganhos-${filter}`,
      rides.map((r) => ({
        id: r.id,
        data: new Date(r.completed_at ?? r.created_at).toLocaleString("pt-BR"),
        origem: r.origin_name,
        destino: r.destination_name,
        categoria: r.category ?? "",
        pagamento: r.payment_method ?? "",
        km: Number(r.distance_km ?? 0).toFixed(2),
        min: Math.round(Number(r.duration_min ?? 0)),
        valor: Number(r.final_price ?? r.estimated_price ?? 0).toFixed(2),
      })),
    );
  }

  function exportPdf() {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("MOVVI DRIVE — Extrato de Ganhos", 14, 16);
    doc.setFontSize(10);
    doc.text(`Período: ${filter} · Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 23);
    doc.text(`Total: ${brl(stats.earnings)} · ${stats.trips} corridas · ${stats.distance.toFixed(1)} km`, 14, 30);
    autoTable(doc, {
      startY: 36,
      head: [["Data", "Origem → Destino", "KM", "Min", "Pagto", "Valor"]],
      body: rides.map((r) => [
        new Date(r.completed_at ?? r.created_at).toLocaleString("pt-BR"),
        `${r.origin_name} → ${r.destination_name}`,
        Number(r.distance_km ?? 0).toFixed(1),
        String(Math.round(Number(r.duration_min ?? 0))),
        r.payment_method ?? "—",
        brl(Number(r.final_price ?? r.estimated_price ?? 0)),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [18, 24, 38] },
    });
    doc.save(`movvi-extrato-${filter}.pdf`);
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MovviHeader logoutRedirect="/" />
      <main className="flex-1 px-4 py-6 pb-28">
        <div className="container mx-auto max-w-3xl space-y-5">
          <header className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/15 text-primary">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold">Meus ganhos</h1>
              <p className="text-xs text-muted-foreground">Acompanhe seu desempenho financeiro.</p>
            </div>
          </header>

          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="today">Hoje</TabsTrigger>
              <TabsTrigger value="yesterday">Ontem</TabsTrigger>
              <TabsTrigger value="week">Semana</TabsTrigger>
              <TabsTrigger value="month">Mês</TabsTrigger>
              <TabsTrigger value="custom">Custom</TabsTrigger>
            </TabsList>
          </Tabs>

          {filter === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando ganhos...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Kpi icon={<DollarSign className="h-4 w-4" />} label="Ganhos" value={brl(stats.earnings)} highlight />
                <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Corridas" value={String(stats.trips)} />
                <Kpi icon={<MapPin className="h-4 w-4" />} label="Distância" value={`${stats.distance.toFixed(1)} km`} />
                <Kpi icon={<Clock className="h-4 w-4" />} label="Tempo viagem" value={`${Math.round(stats.duration)} min`} />
                <Kpi icon={<DollarSign className="h-4 w-4" />} label="Tarifa média" value={brl(stats.avgFare)} />
                <Kpi icon={<DollarSign className="h-4 w-4" />} label="R$/km" value={brl(stats.perKm)} />
              </div>

              <Card>
                <CardContent className="p-4">
                  <h3 className="mb-3 text-sm font-semibold">Ganhos por dia</h3>
                  {chartData.length === 0 ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">Sem corridas no período.</p>
                  ) : (
                    <div className="h-56 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3a" />
                          <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                          <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} />
                          <Tooltip
                            formatter={(v: number) => brl(v)}
                            contentStyle={{ background: "#121826", border: "1px solid #2a2f3a" }}
                          />
                          <Bar dataKey="ganhos" fill="#8DD92B" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <h3 className="mb-3 text-sm font-semibold flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" /> Acumulado total
                  </h3>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <Mini label="Ganhos" value={brl(totalAll.earnings)} />
                    <Mini label="Corridas" value={String(totalAll.trips)} />
                    <Mini label="KM" value={totalAll.distance.toFixed(0)} />
                  </div>
                </CardContent>
              </Card>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button onClick={exportCsv} variant="outline" className="flex-1">
                  <Download className="mr-2 h-4 w-4" /> Exportar CSV
                </Button>
                <Button onClick={exportPdf} variant="outline" className="flex-1">
                  <FileText className="mr-2 h-4 w-4" /> Exportar PDF
                </Button>
              </div>

              <Card>
                <CardContent className="p-4">
                  <h3 className="mb-3 text-sm font-semibold">Extrato de corridas</h3>
                  {rides.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">
                      Nenhuma corrida finalizada no período.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border text-sm">
                      {rides.map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">
                              {r.origin_name} → {r.destination_name}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {new Date(r.completed_at ?? r.created_at).toLocaleString("pt-BR")}
                              {r.distance_km != null ? ` · ${Number(r.distance_km).toFixed(1)} km` : ""}
                              {r.payment_method ? ` · ${r.payment_method}` : ""}
                            </p>
                          </div>
                          <span className="shrink-0 text-sm font-bold text-primary">
                            {brl(Number(r.final_price ?? r.estimated_price ?? 0))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
      <BottomNav items={DRIVER_NAV} />
    </div>
  );
}

function Kpi({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border p-3 ${highlight ? "border-primary/40 bg-primary/10" : "border-border bg-card"}`}>
      <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <span className={highlight ? "text-primary" : ""}>{icon}</span>
        {label}
      </div>
      <p className={`text-base font-bold ${highlight ? "text-primary" : "text-foreground"}`}>{value}</p>
    </div>
  );
}
function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}
