import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Eye,
  Download,
  Copy,
  MapPin,
  Clock,
  CreditCard,
  Car,
  User,
  ShieldAlert,
  Star,
  ExternalLink,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Avatar, DSButton, DSCard, DSCardContent, DSInput, DSSelect, DSSelectContent, DSSelectItem, DSSelectTrigger, DSSelectValue, EmptyState, Loading, StatusPill, dsStatus } from "@/design-system";
import { toast } from "sonner";
import { formatBRL, formatDate } from "@/lib/formatters";
import { downloadCsv } from "@/lib/csvExport";

export const Route = createFileRoute("/admin/corridas")({
  head: () => ({ meta: [{ title: "Corridas — Admin APOIS" }] }),
  component: AdminCorridasPage,
});

type Ride = {
  id: string;
  passenger_id: string | null;
  driver_id: string | null;
  category: string | null;
  status: string;
  origin_name: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
  destination_name: string | null;
  destination_lat: number | null;
  destination_lng: number | null;
  distance_km: number | null;
  duration_min: number | null;
  estimated_price: number | null;
  final_price: number | null;
  payment_method: string | null;
  passenger_rating: number | null;
  passenger_rating_comment: string | null;
  driver_rating: number | null;
  driver_rating_comment: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  driver_vehicle: string | null;
  driver_photo_url: string | null;
  passenger_photo_url: string | null;
  driver_lat: number | null;
  driver_lng: number | null;
  route_polyline: string | null;
  safety_code: string | null;
  fare_breakdown: unknown;
  pickup_label: string | null;
  pickup_address: string | null;
  created_at: string;
  accepted_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
};

type Period = "today" | "yesterday" | "week" | "month" | "all";
type StatusFilter =
  | "all"
  | "procurar_motorista"
  | "motorista_a_caminho"
  | "motorista_chegou"
  | "em_viagem"
  | "finalizada"
  | "cancelada_passageiro"
  | "cancelada_motorista";

const STATUS_LABEL: Record<string, string> = {
  procurar_motorista: "Buscando",
  motorista_a_caminho: "A caminho",
  motorista_chegou: "Chegou",
  em_viagem: "Em viagem",
  finalizada: "Finalizada",
  cancelada_passageiro: "Cancelada (passageiro)",
  cancelada_motorista: "Cancelada (motorista)",
};

const STATUS_PILL: Record<string, keyof typeof dsStatus> = {
  procurar_motorista: "searching",
  motorista_a_caminho: "driverComing",
  motorista_chegou: "arrived",
  em_viagem: "trip",
  finalizada: "finished",
  cancelada_passageiro: "cancelled",
  cancelada_motorista: "cancelled",
};

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Dinheiro",
  dinheiro: "Dinheiro",
  pix: "PIX",
  credit_card: "Crédito",
  cartao_credito: "Crédito",
  cartao: "Cartão",
};

function paymentLabel(v: string | null | undefined) {
  if (!v) return "Não informado";
  return PAYMENT_LABEL[v.toLowerCase()] ?? v;
}

const COORDS_RE = /^-?\d+[.,]\d+\s*,\s*-?\d+[.,]\d+$/;
function displayAddress(name: string | null | undefined, lat?: number | null, lng?: number | null) {
  const trimmed = (name ?? "").trim();
  if (!trimmed) {
    if (lat != null && lng != null) return "Localização atual";
    return "Endereço não identificado";
  }
  if (COORDS_RE.test(trimmed)) return "Localização atual";
  return trimmed;
}

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

async function copyText(text: string, label = "Copiado") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  } catch {
    toast.error("Não foi possível copiar");
  }
}

function AdminCorridasPage() {
  const [rows, setRows] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<Period>("today");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [payment, setPayment] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [selected, setSelected] = useState<Ride | null>(null);

  async function refresh() {
    setLoading(true);
    let query = supabase
      .from("rides")
      .select(
        "id,passenger_id,driver_id,category,status,origin_name,origin_lat,origin_lng,destination_name,destination_lat,destination_lng,distance_km,duration_min,estimated_price,final_price,payment_method,passenger_rating,passenger_rating_comment,driver_rating,driver_rating_comment,driver_name,driver_phone,driver_vehicle,driver_photo_url,passenger_photo_url,driver_lat,driver_lng,route_polyline,safety_code,fare_breakdown,pickup_label,pickup_address,created_at,accepted_at,started_at,completed_at,cancelled_at,cancel_reason",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    const { from, to } = periodRange(period);
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lt("created_at", to);
    if (status !== "all") query = query.eq("status", status);
    if (payment !== "all") query = query.eq("payment_method", payment);
    if (category !== "all") query = query.eq("category", category as never);
    const { data, error } = await query;
    if (error) toast.error(error.message);
    setRows((data ?? []) as Ride[]);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, status, payment, category]);

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

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      [
        r.id,
        r.driver_name,
        r.origin_name,
        r.destination_name,
        r.category,
        r.payment_method,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [rows, q]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.category && set.add(r.category));
    return Array.from(set).sort();
  }, [rows]);

  const payments = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.payment_method && set.add(r.payment_method));
    return Array.from(set);
  }, [rows]);

  const summary = useMemo(() => {
    const r = filtered;
    return {
      total: r.length,
      finalized: r.filter((x) => x.status === "finalizada").length,
      cancelled: r.filter((x) => x.status.startsWith("cancelada")).length,
      revenue: r
        .filter((x) => x.status === "finalizada")
        .reduce((s, x) => s + (x.final_price ?? 0), 0),
    };
  }, [filtered]);

  function exportCsv() {
    downloadCsv(
      `corridas-${new Date().toISOString().slice(0, 10)}`,
      filtered.map((r) => ({
        id: r.id,
        criada: r.created_at,
        status: r.status,
        categoria: r.category,
        origem: displayAddress(r.origin_name, r.origin_lat, r.origin_lng),
        destino: displayAddress(r.destination_name, r.destination_lat, r.destination_lng),
        distancia_km: r.distance_km,
        duracao_min: r.duration_min,
        valor: r.final_price ?? r.estimated_price,
        motorista: r.driver_name,
        pagamento: paymentLabel(r.payment_method),
      })),
    );
  }

  return (
    <AdminLayout
      title="Corridas"
      description={`${summary.total} no período · ${summary.finalized} concluídas · ${summary.cancelled} canceladas · ${formatBRL(summary.revenue)}`}
      actions={
        <DSButton variant="outline" size="sm" onClick={exportCsv} className="gap-1">
          <Download className="h-4 w-4" /> CSV
        </DSButton>
      }
    >
      <div className="mb-4 grid gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <DSInput
            placeholder="Buscar por ID, motorista, origem, destino, categoria ou pagamento"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <DSSelect value={payment} onValueChange={setPayment}>
            <DSSelectTrigger className="h-9 w-[160px]">
              <DSSelectValue placeholder="Pagamento" />
            </DSSelectTrigger>
            <DSSelectContent>
              <DSSelectItem value="all">Todos pagamentos</DSSelectItem>
              {payments.map((p) => (
                <DSSelectItem key={p} value={p}>
                  {paymentLabel(p)}
                </DSSelectItem>
              ))}
            </DSSelectContent>
          </DSSelect>
          <DSSelect value={category} onValueChange={setCategory}>
            <DSSelectTrigger className="h-9 w-[160px]">
              <DSSelectValue placeholder="Categoria" />
            </DSSelectTrigger>
            <DSSelectContent>
              <DSSelectItem value="all">Todas categorias</DSSelectItem>
              {categories.map((c) => (
                <DSSelectItem key={c} value={c}>
                  {c}
                </DSSelectItem>
              ))}
            </DSSelectContent>
          </DSSelect>
        </div>
      </div>

      {loading ? (
        <Loading label="Carregando corridas..." />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Nenhuma corrida encontrada"
          description="Ajuste os filtros para ver corridas neste período."
        />
      ) : (
        <div className="grid gap-2">
          {filtered.map((r) => (
            <RideRow key={r.id} r={r} onOpen={() => setSelected(r)} />
          ))}
        </div>
      )}

      <RideDetail open={!!selected} onOpenChange={(o) => !o && setSelected(null)} ride={selected} />
    </AdminLayout>
  );
}

function RideRow({ r, onOpen }: { r: Ride; onOpen: () => void }) {
  const origin = displayAddress(r.origin_name, r.origin_lat, r.origin_lng);
  const dest = displayAddress(r.destination_name, r.destination_lat, r.destination_lng);
  return (
    <DSCard className="border-border bg-card/60 transition-colors hover:bg-card">
      <DSCardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[10px] text-muted-foreground">{r.id.slice(0, 8)}</span>
            <StatusPill
              status={STATUS_PILL[r.status] ?? "searching"}
              label={STATUS_LABEL[r.status] ?? r.status}
              pulse={false}
            />
            {r.category && (
              <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {r.category}
              </span>
            )}
            {r.payment_method && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                <CreditCard className="h-3 w-3" />
                {paymentLabel(r.payment_method)}
              </span>
            )}
          </div>
          <p className="truncate text-xs">
            <span className="text-muted-foreground">De </span>
            {origin}
            <span className="text-muted-foreground"> → </span>
            {dest}
          </p>
          <p className="flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
            <span>{formatDate(r.created_at)}</span>
            {r.distance_km != null && <span>{r.distance_km.toFixed(1)} km</span>}
            {r.duration_min != null && <span>{Math.round(r.duration_min)} min</span>}
            <span>Motorista: {r.driver_name ?? "—"}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold">
            {formatBRL(r.final_price ?? r.estimated_price ?? 0)}
          </span>
          <DSButton size="sm" variant="ghost" onClick={onOpen} aria-label="Ver detalhes">
            <Eye className="h-4 w-4" />
          </DSButton>
        </div>
      </DSCardContent>
    </DSCard>
  );
}

/* ============================================================
 * DETAIL SHEET
 * ============================================================ */

type Passenger = {
  auth_user_id: string;
  name: string | null;
  phone: string | null;
  avatar_url: string | null;
  average_rating: number | null;
  total_ratings: number | null;
  completed_rides: number | null;
};

type Driver = {
  user_id: string;
  name: string | null;
  phone: string | null;
  photo_url: string | null;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  vehicle_color: string | null;
  average_rating: number | null;
  total_ratings: number | null;
  subscription_status: string | null;
};

type SosAlert = { id: string; created_at: string; message: string | null };
type IncidentReport = { id: string; created_at: string; category: string | null; description: string | null; status: string | null };
type SupportTicket = { id: string; created_at: string; subject: string; status: string };

function RideDetail({
  open,
  onOpenChange,
  ride,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ride: Ride | null;
}) {
  const [passenger, setPassenger] = useState<Passenger | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [sos, setSos] = useState<SosAlert[]>([]);
  const [incidents, setIncidents] = useState<IncidentReport[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ride) {
      setPassenger(null);
      setDriver(null);
      setSos([]);
      setIncidents([]);
      setTickets([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const jobs: PromiseLike<unknown>[] = [];
      if (ride.passenger_id) {
        jobs.push(
          supabase
            .from("users")
            .select(
              "auth_user_id,name,phone,avatar_url,average_rating,total_ratings,completed_rides",
            )
            .eq("auth_user_id", ride.passenger_id)
            .maybeSingle()
            .then(({ data }) => {
              if (!cancelled) setPassenger((data as Passenger) ?? null);
            }),
        );
      }
      if (ride.driver_id) {
        jobs.push(
          supabase
            .from("drivers")
            .select(
              "user_id,name,phone,photo_url,vehicle_model,vehicle_plate,vehicle_color,average_rating,total_ratings,subscription_status",
            )
            .eq("user_id", ride.driver_id)
            .maybeSingle()
            .then(({ data }) => {
              if (!cancelled) setDriver((data as Driver) ?? null);
            }),
        );
      }
      jobs.push(
        supabase
          .from("sos_alerts")
          .select("id,created_at,message")
          .eq("ride_id", ride.id)
          .order("created_at", { ascending: false })
          .then(({ data }) => {
            if (!cancelled) setSos(((data as SosAlert[]) ?? []));
          }),
      );
      jobs.push(
        supabase
          .from("incident_reports")
          .select("id,created_at,category,description,status")
          .eq("ride_id", ride.id)
          .order("created_at", { ascending: false })
          .then(({ data }) => {
            if (!cancelled) setIncidents(((data as IncidentReport[]) ?? []));
          }),
      );
      jobs.push(
        supabase
          .from("support_tickets")
          .select("id,created_at,subject,status")
          .eq("ride_id", ride.id)
          .order("created_at", { ascending: false })
          .then(({ data }) => {
            if (!cancelled) setTickets(((data as SupportTicket[]) ?? []));
          }),
      );
      await Promise.allSettled(jobs);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ride]);

  if (!ride) return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent /></Sheet>;

  const origin = displayAddress(ride.origin_name, ride.origin_lat, ride.origin_lng);
  const dest = displayAddress(ride.destination_name, ride.destination_lat, ride.destination_lng);
  const value = ride.final_price ?? ride.estimated_price ?? 0;

  const summary =
    `APOIS · Corrida ${ride.id}\n` +
    `Status: ${STATUS_LABEL[ride.status] ?? ride.status}\n` +
    `Data: ${formatDate(ride.created_at)}\n` +
    `Origem: ${origin}\n` +
    `Destino: ${dest}\n` +
    `Motorista: ${ride.driver_name ?? "—"}\n` +
    `Valor: ${formatBRL(value)}\n` +
    `Pagamento: ${paymentLabel(ride.payment_method)}`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2">
            <span>Corrida</span>
            <span className="font-mono text-xs text-muted-foreground">
              {ride.id.slice(0, 8)}
            </span>
            <StatusPill
              status={STATUS_PILL[ride.status] ?? "searching"}
              label={STATUS_LABEL[ride.status] ?? ride.status}
              pulse={false}
            />
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4 text-sm">
          {/* Overview */}
          <SectionCard title="Visão geral" icon={<Clock className="h-4 w-4" />}>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Info label="Categoria" v={ride.category} />
              <Info label="Criada em" v={formatDate(ride.created_at)} />
              <Info label="Pagamento" v={paymentLabel(ride.payment_method)} />
              <Info label="Valor final" v={formatBRL(value)} />
              <Info
                label="Distância"
                v={ride.distance_km != null ? `${ride.distance_km.toFixed(1)} km` : null}
              />
              <Info
                label="Duração"
                v={ride.duration_min != null ? `${Math.round(ride.duration_min)} min` : null}
              />
            </div>
          </SectionCard>

          {/* Passenger */}
          <SectionCard title="Passageiro" icon={<User className="h-4 w-4" />}>
            <PartyBlock
              photo={passenger?.avatar_url ?? ride.passenger_photo_url ?? null}
              name={passenger?.name ?? "Não informado"}
              phone={passenger?.phone ?? null}
              rating={passenger?.average_rating ?? null}
              totalRatings={passenger?.total_ratings ?? null}
              rides={passenger?.completed_rides ?? null}
            />
          </SectionCard>

          {/* Driver */}
          <SectionCard title="Motorista" icon={<Car className="h-4 w-4" />}>
            <PartyBlock
              photo={driver?.photo_url ?? ride.driver_photo_url ?? null}
              name={driver?.name ?? ride.driver_name ?? "Não informado"}
              phone={driver?.phone ?? ride.driver_phone ?? null}
              rating={driver?.average_rating ?? null}
              totalRatings={driver?.total_ratings ?? null}
              extra={
                <>
                  <Info
                    label="Veículo"
                    v={
                      driver
                        ? [driver.vehicle_model, driver.vehicle_color]
                            .filter(Boolean)
                            .join(" · ")
                        : ride.driver_vehicle
                    }
                  />
                  <Info label="Placa" v={driver?.vehicle_plate} />
                  <Info label="Assinatura" v={driver?.subscription_status} />
                </>
              }
            />
          </SectionCard>

          {/* Route */}
          <SectionCard title="Rota" icon={<MapPin className="h-4 w-4" />}>
            <div className="space-y-1 text-xs">
              <Info label="Origem" v={origin} />
              <Info label="Destino" v={dest} />
              {ride.pickup_address && <Info label="Ponto de embarque" v={ride.pickup_address} />}
            </div>
            <RouteMap
              origin={
                ride.origin_lat != null && ride.origin_lng != null
                  ? [ride.origin_lat, ride.origin_lng]
                  : null
              }
              dest={
                ride.destination_lat != null && ride.destination_lng != null
                  ? [ride.destination_lat, ride.destination_lng]
                  : null
              }
              driver={
                ride.driver_lat != null && ride.driver_lng != null
                  ? [ride.driver_lat, ride.driver_lng]
                  : null
              }
            />
          </SectionCard>

          {/* Timeline */}
          <SectionCard title="Linha do tempo" icon={<Clock className="h-4 w-4" />}>
            <div className="space-y-1.5 text-xs">
              <Timeline label="Solicitada" at={ride.created_at} />
              <Timeline label="Aceita" at={ride.accepted_at} />
              <Timeline label="Iniciada" at={ride.started_at} />
              <Timeline label="Finalizada" at={ride.completed_at} />
              <Timeline label="Cancelada" at={ride.cancelled_at} reason={ride.cancel_reason} />
            </div>
          </SectionCard>

          {/* Safety */}
          <SectionCard title="Segurança e suporte" icon={<ShieldAlert className="h-4 w-4" />}>
            <div className="space-y-2 text-xs">
              <Info label="Código de segurança" v={ride.safety_code} />
              <MiniList
                title="Alertas SOS"
                empty="Nenhum alerta SOS."
                items={sos.map((s) => ({
                  key: s.id,
                  left: formatDate(s.created_at),
                  right: s.message ?? "Alerta",
                }))}
              />
              <MiniList
                title="Denúncias"
                empty="Nenhuma denúncia."
                items={incidents.map((i) => ({
                  key: i.id,
                  left: `${formatDate(i.created_at)} · ${i.category ?? ""}`.trim(),
                  right: i.status ?? "aberto",
                }))}
              />
              <MiniList
                title="Chamados de suporte"
                empty="Nenhum chamado."
                items={tickets.map((t) => ({
                  key: t.id,
                  left: formatDate(t.created_at),
                  right: `${t.subject} · ${t.status}`,
                }))}
              />
            </div>
          </SectionCard>

          {/* Ratings */}
          <SectionCard title="Avaliações" icon={<Star className="h-4 w-4" />}>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <RatingBlock
                title="Passageiro → Motorista"
                rating={ride.driver_rating}
                comment={ride.driver_rating_comment}
              />
              <RatingBlock
                title="Motorista → Passageiro"
                rating={ride.passenger_rating}
                comment={ride.passenger_rating_comment}
              />
            </div>
          </SectionCard>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2">
            <DSButton size="sm" variant="outline" onClick={() => copyText(ride.id, "ID copiado")}>
              <Copy className="mr-2 h-4 w-4" /> Copiar ID
            </DSButton>
            <DSButton size="sm" variant="outline" onClick={() => copyText(summary, "Resumo copiado")}>
              <Copy className="mr-2 h-4 w-4" /> Copiar resumo
            </DSButton>
            {ride.passenger_id && (
              <DSButton
                size="sm"
                variant="outline"
                onClick={() => {
                  window.open(`/admin/passageiros?u=${ride.passenger_id}`, "_blank");
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" /> Perfil passageiro
              </DSButton>
            )}
            {ride.driver_id && (
              <DSButton
                size="sm"
                variant="outline"
                onClick={() => {
                  window.open(`/admin/motoristas?u=${ride.driver_id}`, "_blank");
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" /> Perfil motorista
              </DSButton>
            )}
            {tickets[0] && (
              <DSButton
                size="sm"
                variant="outline"
                onClick={() => {
                  window.open(`/admin/logs?ticket=${tickets[0].id}`, "_blank");
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" /> Abrir chamado
              </DSButton>
            )}
          </div>

          {loading && (
            <p className="pt-2 text-center text-[10px] text-muted-foreground">
              Carregando informações complementares…
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <DSCard className="border-border bg-card/60">
      <DSCardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {icon}
          {title}
        </div>
        <Separator className="opacity-40" />
        {children}
      </DSCardContent>
    </DSCard>
  );
}

function Info({ label, v }: { label: string; v: string | number | null | undefined }) {
  const value = v == null || v === "" ? "Não informado" : String(v);
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="truncate">{value}</p>
    </div>
  );
}

function Timeline({
  label,
  at,
  reason,
}: {
  label: string;
  at: string | null;
  reason?: string | null;
}) {
  return (
    <div className="flex gap-2">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1">
        {at ? formatDate(at) : <span className="text-muted-foreground">Não informado</span>}
        {reason ? ` · ${reason}` : ""}
      </span>
    </div>
  );
}

function PartyBlock({
  photo,
  name,
  phone,
  rating,
  totalRatings,
  rides,
  extra,
}: {
  photo: string | null;
  name: string;
  phone: string | null;
  rating: number | null;
  totalRatings: number | null;
  rides?: number | null;
  extra?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Avatar src={photo} name={name} size={56} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{name}</p>
          <p className="text-xs text-muted-foreground">{phone ?? "Não informado"}</p>
          <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Star className="h-3 w-3 text-amber-400" />
              {rating != null ? rating.toFixed(2) : "—"}
              {totalRatings != null && ` (${totalRatings})`}
            </span>
            {rides != null && <span>· {rides} corridas</span>}
          </p>
        </div>
      </div>
      {extra && <div className="grid grid-cols-2 gap-3 text-xs">{extra}</div>}
    </div>
  );
}

function RatingBlock({
  title,
  rating,
  comment,
}: {
  title: string;
  rating: number | null;
  comment: string | null;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 p-2">
      <p className="text-[10px] uppercase text-muted-foreground">{title}</p>
      <p className="flex items-center gap-1 font-semibold">
        <Star className="h-3 w-3 text-amber-400" />
        {rating != null ? `${rating}/5` : "Não avaliado"}
      </p>
      {comment && <p className="mt-1 text-[11px] italic text-muted-foreground">“{comment}”</p>}
    </div>
  );
}

function MiniList({
  title,
  items,
  empty,
}: {
  title: string;
  items: { key: string; left: string; right: string }[];
  empty: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase text-muted-foreground">{title}</p>
      {items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {items.map((i) => (
            <li key={i.key} className="flex justify-between gap-2 text-[11px]">
              <span className="truncate text-muted-foreground">{i.left}</span>
              <span className="truncate text-right">{i.right}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RouteMap({
  origin,
  dest,
  driver,
}: {
  origin: [number, number] | null;
  dest: [number, number] | null;
  driver: [number, number] | null;
}) {
  const points = [origin, dest, driver].filter(Boolean) as [number, number][];
  if (points.length === 0) return null;
  const markers = points
    .map(([lat, lng], i) => `pin-s-${["a", "b", "c"][i]}+ef4444(${lng},${lat})`)
    .join(",");
  const center = points[0];
  const url = `https://staticmap.openstreetmap.de/staticmap.php?center=${center[0]},${center[1]}&zoom=13&size=600x260&markers=${points
    .map(([lat, lng]) => `${lat},${lng},red-pushpin`)
    .join("|")}`;
  return (
    <div className="mt-2 overflow-hidden rounded-md border border-border/60">
      <img
        src={url}
        alt="Mapa da rota"
        className="h-40 w-full object-cover"
        loading="lazy"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
      <div className="hidden">{markers}</div>
    </div>
  );
}
