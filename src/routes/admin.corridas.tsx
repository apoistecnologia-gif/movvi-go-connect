import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Eye, X, Download } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatBRL, formatDate } from "@/lib/formatters";
import { logAdminAction } from "@/lib/adminAudit";
import { downloadCsv } from "@/lib/csvExport";
import { cancelarPeloPassageiro } from "@/lib/rideLifecycle";

export const Route = createFileRoute("/admin/corridas")({
  head: () => ({ meta: [{ title: "Corridas — Admin MOVVI" }] }),
  component: AdminCorridasPage,
});

type Ride = {
  id: string;
  passenger_id: string | null;
  driver_id: string | null;
  category: string | null;
  status: string;
  origin_name: string | null;
  destination_name: string | null;
  distance_km: number | null;
  duration_min: number | null;
  estimated_price: number | null;
  final_price: number | null;
  payment_method: string | null;
  passenger_rating: number | null;
  driver_rating: number | null;
  driver_name: string | null;
  safety_code: string | null;
  created_at: string;
  accepted_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
};

type Period = "today" | "yesterday" | "week" | "month" | "all";
type StatusFilter = "all" | "procurar_motorista" | "motorista_a_caminho" | "motorista_chegou" | "em_viagem" | "finalizada" | "cancelada_passageiro" | "cancelada_motorista";

const STATUS_LABEL: Record<string, string> = {
  procurar_motorista: "Buscando",
  motorista_a_caminho: "A caminho",
  motorista_chegou: "Chegou",
  em_viagem: "Em viagem",
  finalizada: "Finalizada",
  cancelada_passageiro: "Cancelada (passageiro)",
  cancelada_motorista: "Cancelada (motorista)",
};

function periodRange(p: Period): { from: string | null; to: string | null } {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (p === "today") return { from: start.toISOString(), to: null };
  if (p === "yesterday") {
    const y = new Date(start);
    y.setDate(y.getDate() - 1);
    return { from: y.toISOString(), to: start.toISOString() };
  }
  if (p === "week") {
    const w = new Date(start);
    w.setDate(w.getDate() - 7);
    return { from: w.toISOString(), to: null };
  }
  if (p === "month") {
    const m = new Date(start);
    m.setDate(m.getDate() - 30);
    return { from: m.toISOString(), to: null };
  }
  return { from: null, to: null };
}

function AdminCorridasPage() {
  const [rows, setRows] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<Period>("today");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<Ride | null>(null);

  async function refresh() {
    setLoading(true);
    let query = supabase
      .from("rides")
      .select(
        "id,passenger_id,driver_id,category,status,origin_name,destination_name,distance_km,duration_min,estimated_price,final_price,payment_method,passenger_rating,driver_rating,driver_name,created_at,accepted_at,started_at,completed_at,cancelled_at,cancel_reason",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    const { from, to } = periodRange(period);
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lt("created_at", to);
    if (status !== "all") query = query.eq("status", status);
    if (q.trim()) {
      const term = `%${q.trim()}%`;
      query = query.or(`id.ilike.${term},driver_name.ilike.${term},origin_name.ilike.${term},destination_name.ilike.${term},category.ilike.${term}`);
    }
    const { data, error } = await query;
    if (error) toast.error(error.message);
    setRows((data ?? []) as Ride[]);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, status, q]);

  useEffect(() => {
    const ch = supabase
      .channel("admin-rides")
      .on("postgres_changes", { event: "*", schema: "public", table: "rides" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = useMemo(() => {
    const r = rows;
    return {
      total: r.length,
      finalized: r.filter((x) => x.status === "finalizada").length,
      cancelled: r.filter((x) => x.status.startsWith("cancelada")).length,
      revenue: r.filter((x) => x.status === "finalizada").reduce((s, x) => s + (x.final_price ?? 0), 0),
    };
  }, [rows]);

  function exportCsv() {
    downloadCsv(
      `corridas-${new Date().toISOString().slice(0, 10)}`,
      rows.map((r) => ({
        id: r.id,
        criada: r.created_at,
        status: r.status,
        categoria: r.category,
        origem: r.origin_name,
        destino: r.destination_name,
        distancia_km: r.distance_km,
        duracao_min: r.duration_min,
        valor: r.final_price ?? r.estimated_price,
        motorista: r.driver_name,
        pagamento: r.payment_method,
      })),
    );
  }

  async function cancelRide(r: Ride) {
    if (!confirm(`Cancelar a corrida ${r.id.slice(0, 8)}?`)) return;
    try {
      await cancelarPeloPassageiro({ data: { rideId: r.id, reason: "admin_cancel" } });
      await logAdminAction({ action: "ride.cancel", entity: "rides", entity_id: r.id });
      toast.success("Corrida cancelada");
      refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro: " + msg);
    }
  }

  return (
    <AdminLayout
      title="Corridas"
      description={`${summary.total} no período · ${summary.finalized} concluídas · ${formatBRL(summary.revenue)}`}
      actions={
        <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1">
          <Download className="h-4 w-4" /> CSV
        </Button>
      }
    >
      <div className="mb-4 grid gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar ID, motorista, origem, destino, categoria"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <TabsList>
              <TabsTrigger value="today">Hoje</TabsTrigger>
              <TabsTrigger value="yesterday">Ontem</TabsTrigger>
              <TabsTrigger value="week">7 dias</TabsTrigger>
              <TabsTrigger value="month">30 dias</TabsTrigger>
              <TabsTrigger value="all">Tudo</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <TabsList className="flex-wrap">
              <TabsTrigger value="all">Todos</TabsTrigger>
              <TabsTrigger value="procurar_motorista">Buscando</TabsTrigger>
              <TabsTrigger value="motorista_a_caminho">A caminho</TabsTrigger>
              <TabsTrigger value="em_viagem">Em viagem</TabsTrigger>
              <TabsTrigger value="finalizada">Finalizada</TabsTrigger>
              <TabsTrigger value="cancelada_passageiro">Cancelada</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {loading ? (
        <div className="grid place-items-center py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Sem corridas.</p>
      ) : (
        <div className="grid gap-2">
          {rows.map((r) => (
            <Card key={r.id} className="border-border bg-card/60">
              <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground">{r.id.slice(0, 8)}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                    {r.category && <Badge className="text-[10px]">{r.category}</Badge>}
                  </div>
                  <p className="truncate text-xs">
                    <span className="text-muted-foreground">De </span>
                    {r.origin_name ?? "?"}
                    <span className="text-muted-foreground"> → </span>
                    {r.destination_name ?? "?"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatDate(r.created_at)} · {r.distance_km?.toFixed(1) ?? "?"} km · {r.driver_name ?? "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{formatBRL(r.final_price ?? r.estimated_price ?? 0)}</span>
                  <Button size="sm" variant="ghost" onClick={() => setSelected(r)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  {!["finalizada", "cancelada_passageiro", "cancelada_motorista"].includes(r.status) && (
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => cancelRide(r)}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <RideDetail open={!!selected} onOpenChange={(o) => !o && setSelected(null)} ride={selected} />
    </AdminLayout>
  );
}

function RideDetail({
  open,
  onOpenChange,
  ride,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ride: Ride | null;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Corrida {ride?.id.slice(0, 8)}</SheetTitle>
        </SheetHeader>
        {!ride ? null : (
          <div className="mt-4 space-y-4 text-sm">
            <Card>
              <CardContent className="grid grid-cols-2 gap-2 p-4 text-xs">
                <Info label="Status" v={STATUS_LABEL[ride.status] ?? ride.status} />
                <Info label="Categoria" v={ride.category} />
                <Info label="Distância" v={ride.distance_km ? `${ride.distance_km.toFixed(1)} km` : "—"} />
                <Info label="Duração" v={ride.duration_min ? `${ride.duration_min} min` : "—"} />
                <Info label="Estimado" v={formatBRL(ride.estimated_price ?? 0)} />
                <Info label="Final" v={formatBRL(ride.final_price ?? 0)} />
                <Info label="Pagamento" v={ride.payment_method} />
                <Info label="Aval. motorista" v={ride.driver_rating ? `${ride.driver_rating}/5` : "—"} />
                <Info label="Aval. passageiro" v={ride.passenger_rating ? `${ride.passenger_rating}/5` : "—"} />
                <Info label="Motorista" v={ride.driver_name} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-1 p-4 text-xs">
                <Info label="Origem" v={ride.origin_name} />
                <Info label="Destino" v={ride.destination_name} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-1 p-4 text-xs">
                <h4 className="text-[10px] font-semibold uppercase text-muted-foreground">Linha do tempo</h4>
                <Timeline label="Solicitada" at={ride.created_at} />
                <Timeline label="Aceita" at={ride.accepted_at} />
                <Timeline label="Iniciada" at={ride.started_at} />
                <Timeline label="Finalizada" at={ride.completed_at} />
                <Timeline label="Cancelada" at={ride.cancelled_at} reason={ride.cancel_reason} />
              </CardContent>
            </Card>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Info({ label, v }: { label: string; v: string | number | null | undefined }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p>{v == null || v === "" ? "—" : String(v)}</p>
    </div>
  );
}
function Timeline({ label, at, reason }: { label: string; at: string | null; reason?: string | null }) {
  if (!at) return null;
  return (
    <div className="flex gap-2">
      <span className="w-24 text-muted-foreground">{label}</span>
      <span>
        {formatDate(at)}
        {reason ? ` · ${reason}` : ""}
      </span>
    </div>
  );
}
