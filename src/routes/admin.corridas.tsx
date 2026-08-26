import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Car, Clock, Eye, MapPin, RefreshCw, Search } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import {
  DSBadge,
  DSButton,
  DSCard,
  DSCardContent,
  DSInput,
  EmptyState,
  Loading,
} from "@/design-system";
import { toast } from "sonner";

type RideRow = {
  id: string;
  passenger_id: string;
  driver_id: string | null;
  category: string;
  status: string;
  origin_name: string;
  destination_name: string;
  estimated_price: number;
  final_price: number | null;
  distance_km: number | null;
  duration_min: number | null;
  payment_method: string;
  driver_name: string | null;
  driver_phone: string | null;
  driver_vehicle_model: string | null;
  driver_vehicle_color: string | null;
  driver_vehicle_plate: string | null;
  driver_rating: number | null;
  passenger_rating: number | null;
  passenger_rating_comment: string | null;
  cancellation_fee: number | null;
  cancellation_reason: string | null;
  cancelled_by: string | null;
  dispatch_attempts: number;
  scheduled_for: string | null;
  accepted_at: string | null;
  driver_arrived_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

type Passenger = { id: string; name: string | null; phone: string | null; average_rating: number | null };
type Filter = "todas" | "ativas" | "finalizadas" | "canceladas" | "agendadas";

export const Route = createFileRoute("/admin/corridas")({
  head: () => ({ meta: [{ title: "Corridas — Admin APOIS" }] }),
  component: AdminCorridasPage,
});

function finiteNonNegative(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

const money = (value: unknown) => {
  const safe = finiteNonNegative(value);
  return safe == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(safe);
};

function cleanText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text || fallback;
}

function safeDateLabel(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? "Data não informada" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function statusLabel(status: string) {
  const normalized = cleanText(status, "não informado").toLowerCase();
  const labels: Record<string, string> = {
    procurar_motorista: "Procurando motorista",
    motorista_a_caminho: "Motorista a caminho",
    motorista_chegou: "Motorista chegou",
    em_viagem: "Em viagem",
    finalizada: "Finalizada",
    agendada: "Agendada",
    expired: "Expirada",
    cancelada_passageiro: "Cancelada pelo passageiro",
    cancelada_motorista: "Cancelada pelo motorista",
    cancelada_admin: "Cancelada pelo suporte",
  };
  return labels[normalized] ?? cleanText(status, "Não informado").replace(/_/g, " ");
}

function rideVariant(status: string): "primary" | "success" | "warning" | "danger" | "muted" {
  const normalized = status.toLowerCase();
  if (["motorista_a_caminho", "motorista_chegou", "em_viagem"].includes(normalized)) return "primary";
  if (normalized === "finalizada") return "success";
  if (normalized === "procurar_motorista" || normalized === "agendada") return "warning";
  if (normalized.startsWith("cancelada") || normalized === "expired") return "danger";
  return "muted";
}

function normalizeRide(row: RideRow): RideRow | null {
  const id = cleanText(row.id);
  const passengerId = cleanText(row.passenger_id);
  if (!id || !passengerId) return null;
  return {
    ...row,
    id,
    passenger_id: passengerId,
    driver_id: cleanText(row.driver_id) || null,
    category: cleanText(row.category, "Não informada"),
    status: cleanText(row.status, "não informado").toLowerCase(),
    origin_name: cleanText(row.origin_name, "Origem não informada"),
    destination_name: cleanText(row.destination_name, "Destino não informado"),
    estimated_price: finiteNonNegative(row.estimated_price) ?? 0,
    final_price: finiteNonNegative(row.final_price),
    distance_km: finiteNonNegative(row.distance_km),
    duration_min: finiteNonNegative(row.duration_min),
    payment_method: cleanText(row.payment_method, "Não informado"),
    driver_name: cleanText(row.driver_name) || null,
    driver_phone: cleanText(row.driver_phone) || null,
    driver_vehicle_model: cleanText(row.driver_vehicle_model) || null,
    driver_vehicle_color: cleanText(row.driver_vehicle_color) || null,
    driver_vehicle_plate: cleanText(row.driver_vehicle_plate).toUpperCase().replace(/\s+/g, "") || null,
    driver_rating: finiteNonNegative(row.driver_rating),
    passenger_rating: finiteNonNegative(row.passenger_rating),
    passenger_rating_comment: cleanText(row.passenger_rating_comment) || null,
    cancellation_fee: finiteNonNegative(row.cancellation_fee),
    cancellation_reason: cleanText(row.cancellation_reason) || null,
    cancelled_by: cleanText(row.cancelled_by) || null,
    dispatch_attempts: Math.max(0, Math.floor(finiteNonNegative(row.dispatch_attempts) ?? 0)),
  };
}

function AdminCorridasPage() {
  const [rides, setRides] = useState<RideRow[]>([]);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("todas");
  const [selected, setSelected] = useState<RideRow | null>(null);
  const requestRef = useRef(0);

  async function load() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const { data: rideData, error: rideError } = await supabase
        .from("rides")
        .select("id,passenger_id,driver_id,category,status,origin_name,destination_name,estimated_price,final_price,distance_km,duration_min,payment_method,driver_name,driver_phone,driver_vehicle_model,driver_vehicle_color,driver_vehicle_plate,driver_rating,passenger_rating,passenger_rating_comment,cancellation_fee,cancellation_reason,cancelled_by,dispatch_attempts,scheduled_for,accepted_at,driver_arrived_at,started_at,completed_at,cancelled_at,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(300);
      if (requestId !== requestRef.current) return;
      if (rideError) throw rideError;
      const nextRides = ((rideData ?? []) as RideRow[]).map(normalizeRide).filter((ride): ride is RideRow => Boolean(ride));
      setRides(nextRides);
      setSelected((current) => current ? (nextRides.find((ride) => ride.id === current.id) ?? null) : null);

      const passengerIds = [...new Set(nextRides.map((ride) => ride.passenger_id).filter(Boolean))];
      if (passengerIds.length) {
        const { data: passengerData, error: passengerError } = await supabase.from("users").select("id,name,phone,average_rating").in("id", passengerIds);
        if (requestId !== requestRef.current) return;
        if (passengerError) throw passengerError;
        setPassengers(((passengerData ?? []) as Passenger[]).filter((passenger) => Boolean(cleanText(passenger.id))));
      } else {
        setPassengers([]);
      }
    } catch (error) {
      if (requestId !== requestRef.current) return;
      setRides([]);
      setPassengers([]);
      setSelected(null);
      setLoadError("Não foi possível carregar as corridas agora. Tente novamente.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao carregar corridas", error);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    let refreshTimer: number | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void load(), 250);
    };
    const channel = supabase.channel("admin-canonical-rides").on("postgres_changes", { event: "*", schema: "public", table: "rides" }, scheduleRefresh).subscribe();
    const onVisible = () => { if (document.visibilityState === "visible") scheduleRefresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      requestRef.current += 1;
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, []);

  const passengerById = useMemo(() => new Map(passengers.map((passenger) => [passenger.id, passenger])), [passengers]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    return rides.filter((ride) => {
      if (filter === "ativas" && !["procurar_motorista", "motorista_a_caminho", "motorista_chegou", "em_viagem"].includes(ride.status)) return false;
      if (filter === "finalizadas" && ride.status !== "finalizada") return false;
      if (filter === "canceladas" && !ride.status.startsWith("cancelada") && ride.status !== "expired") return false;
      if (filter === "agendadas" && ride.status !== "agendada") return false;
      if (!needle) return true;
      const passenger = passengerById.get(ride.passenger_id);
      return [ride.id, ride.origin_name, ride.destination_name, ride.driver_name, ride.driver_vehicle_plate, passenger?.name, passenger?.phone]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(needle));
    });
  }, [filter, passengerById, query, rides]);

  return (
    <AdminLayout
      title="Corridas"
      description="Leitura operacional da entidade canônica rides e seu ciclo de vida"
      actions={
        <DSButton variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="min-h-11 gap-2" aria-busy={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
          {loading ? "Atualizando…" : "Atualizar"}
        </DSButton>
      }
    >
      <DSCard className="mb-4 border-primary/20 bg-primary/5"><DSCardContent className="p-4 text-sm leading-6 text-muted-foreground">Esta tela é somente de leitura. Alterações do ciclo da corrida continuam restritas ao backend autoritativo e ao Dispatch Engine.</DSCardContent></DSCard>

      <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <DSInput className="min-h-11 pl-9 text-base" placeholder="Buscar corrida, passageiro, motorista, placa ou endereço" value={query} maxLength={160} aria-label="Buscar corridas" onChange={(event) => setQuery(event.target.value)} />
        </div>
        <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)} className="min-h-11 rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Filtrar corridas por situação">
          <option value="todas">Todas</option><option value="ativas">Ativas</option><option value="agendadas">Agendadas</option><option value="finalizadas">Finalizadas</option><option value="canceladas">Canceladas/expiradas</option>
        </select>
      </div>

      {loading ? <div aria-live="polite"><Loading label="Carregando corridas..." /></div> : loadError ? (
        <DSCard className="border-destructive/30 bg-destructive/5"><DSCardContent className="space-y-3 p-4" role="alert"><p className="text-sm font-medium text-destructive">{loadError}</p><DSButton variant="outline" className="min-h-11" onClick={() => void load()}>Tentar novamente</DSButton></DSCardContent></DSCard>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Car} title="Nenhuma corrida encontrada" description={query.trim() || filter !== "todas" ? "Ajuste a busca ou os filtros." : "Aguarde novas solicitações."} />
      ) : (
        <div className="space-y-2">
          {filtered.map((ride) => {
            const passenger = passengerById.get(ride.passenger_id);
            return <DSCard key={ride.id}><DSCardContent className="space-y-3 p-4">
              <div className="flex min-w-0 flex-wrap items-start gap-3"><div className="min-w-0 flex-1 basis-56"><p className="break-all font-mono text-xs text-primary">{ride.id}</p><p className="mt-1 break-words text-sm font-semibold">{ride.origin_name} → {ride.destination_name}</p><p className="break-words text-sm text-muted-foreground">Passageiro: {cleanText(passenger?.name) || `${ride.passenger_id.slice(0, 8)}…`} · Motorista: {ride.driver_name || "Ainda não atribuído"}</p></div><DSBadge variant={rideVariant(ride.status)}>{statusLabel(ride.status)}</DSBadge></div>
              <div className="flex flex-wrap gap-x-2 gap-y-1 text-sm text-muted-foreground"><span>{ride.category}</span><span aria-hidden="true">•</span><span>{money(ride.final_price ?? ride.estimated_price)}</span><span aria-hidden="true">•</span><span>{ride.payment_method}</span><span aria-hidden="true">•</span><span>{safeDateLabel(ride.created_at)}</span></div>
              <DSButton variant="outline" size="sm" onClick={() => setSelected(ride)} className="min-h-11 gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Eye className="h-4 w-4" aria-hidden="true" /> Detalhes</DSButton>
            </DSCardContent></DSCard>;
          })}
        </div>
      )}

      {selected && <DSCard className="mt-6 border-primary/20"><DSCardContent className="space-y-4 p-4 text-sm">
        <div className="flex min-w-0 flex-wrap items-center gap-2"><h2 className="min-w-0 flex-1 break-words font-semibold">Detalhes da corrida</h2><DSButton variant="ghost" size="sm" className="min-h-11" onClick={() => setSelected(null)}>Fechar</DSButton></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Detail icon={MapPin} label="Origem" value={selected.origin_name} /><Detail icon={MapPin} label="Destino" value={selected.destination_name} /><Detail icon={Car} label="Categoria" value={selected.category} /><Detail icon={Clock} label="Distância" value={selected.distance_km == null ? "—" : `${selected.distance_km.toFixed(1)} km`} /><Detail icon={Clock} label="Duração" value={selected.duration_min == null ? "—" : `${Math.round(selected.duration_min)} min`} /><Detail icon={Car} label="Motorista" value={selected.driver_name || "Não atribuído"} /></div>
        <div className="min-w-0 rounded-xl border border-border p-3 text-sm leading-6 text-muted-foreground"><p className="break-words">Estimado: {money(selected.estimated_price)} · Final: {money(selected.final_price)} · Pagamento: {selected.payment_method}</p><p className="mt-1">Tentativas de despacho: {selected.dispatch_attempts}</p>{selected.driver_vehicle_model && <p className="mt-1 break-words">Veículo: {[selected.driver_vehicle_model, selected.driver_vehicle_color, selected.driver_vehicle_plate].filter(Boolean).join(" · ")}</p>}{selected.cancellation_reason && <p className="mt-1 break-words text-destructive">Cancelamento: {selected.cancellation_reason} {selected.cancelled_by ? `(${selected.cancelled_by.replace(/_/g, " ")})` : ""}</p>}{selected.passenger_rating != null && <p className="mt-1 break-words">Avaliação do passageiro: {Math.min(5, selected.passenger_rating).toFixed(1)}{selected.passenger_rating_comment ? ` — ${selected.passenger_rating_comment}` : ""}</p>}{selected.driver_rating != null && <p className="mt-1">Avaliação do motorista: {Math.min(5, selected.driver_rating).toFixed(1)}</p>}</div>
      </DSCardContent></DSCard>}
    </AdminLayout>
  );
}

function Detail({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return <div className="min-w-0 rounded-xl border border-border p-3"><p className="flex items-center gap-1 text-xs uppercase tracking-wider text-muted-foreground"><Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {label}</p><p className="mt-1 break-words font-medium">{cleanText(value, "Não informado")}</p></div>;
}
