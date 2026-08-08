import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Car, Clock, Eye, MapPin, RefreshCw, Search } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { DSBadge, DSButton, DSCard, DSCardContent, DSInput, EmptyState, Loading } from "@/design-system";
import { formatDate } from "@/lib/formatters";
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

const money = (value: number | null) =>
  value == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

function rideVariant(status: string): "primary" | "success" | "warning" | "danger" | "muted" {
  if (["motorista_a_caminho", "motorista_chegou", "em_viagem"].includes(status)) return "primary";
  if (status === "finalizada") return "success";
  if (status === "procurar_motorista" || status === "agendada") return "warning";
  if (status.startsWith("cancelada") || status === "expired") return "danger";
  return "muted";
}

function AdminCorridasPage() {
  const [rides, setRides] = useState<RideRow[]>([]);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("todas");
  const [selected, setSelected] = useState<RideRow | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data: rideData, error: rideError } = await supabase
        .from("rides")
        .select("id,passenger_id,driver_id,category,status,origin_name,destination_name,estimated_price,final_price,distance_km,duration_min,payment_method,driver_name,driver_phone,driver_vehicle_model,driver_vehicle_color,driver_vehicle_plate,driver_rating,passenger_rating,passenger_rating_comment,cancellation_fee,cancellation_reason,cancelled_by,dispatch_attempts,scheduled_for,accepted_at,driver_arrived_at,started_at,completed_at,cancelled_at,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(300);
      if (rideError) throw rideError;
      const nextRides = (rideData ?? []) as RideRow[];
      setRides(nextRides);
      setSelected((current) => current ? nextRides.find((ride) => ride.id === current.id) ?? null : null);

      const passengerIds = [...new Set(nextRides.map((ride) => ride.passenger_id))];
      if (passengerIds.length) {
        const { data: passengerData, error: passengerError } = await supabase
          .from("users")
          .select("id,name,phone,average_rating")
          .in("id", passengerIds);
        if (passengerError) throw passengerError;
        setPassengers((passengerData ?? []) as Passenger[]);
      } else {
        setPassengers([]);
      }
    } catch (error) {
      setRides([]);
      setPassengers([]);
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar as corridas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const channel = supabase
      .channel("admin-canonical-rides")
      .on("postgres_changes", { event: "*", schema: "public", table: "rides" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  const passengerById = useMemo(() => new Map(passengers.map((passenger) => [passenger.id, passenger])), [passengers]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rides.filter((ride) => {
      if (filter === "ativas" && !["procurar_motorista", "motorista_a_caminho", "motorista_chegou", "em_viagem"].includes(ride.status)) return false;
      if (filter === "finalizadas" && ride.status !== "finalizada") return false;
      if (filter === "canceladas" && !ride.status.startsWith("cancelada") && ride.status !== "expired") return false;
      if (filter === "agendadas" && ride.status !== "agendada") return false;
      if (!needle) return true;
      const passenger = passengerById.get(ride.passenger_id);
      return [ride.id, ride.origin_name, ride.destination_name, ride.driver_name, ride.driver_vehicle_plate, passenger?.name, passenger?.phone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [filter, passengerById, query, rides]);

  return (
    <AdminLayout
      title="Corridas"
      description="Leitura operacional da entidade canônica rides e seu ciclo de vida"
      actions={
        <DSButton variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </DSButton>
      }
    >
      <DSCard className="mb-4 border-primary/20 bg-primary/5">
        <DSCardContent className="p-4 text-sm text-muted-foreground">
          Esta tela não altera o status da corrida diretamente no navegador. Transições de estado pertencem ao backend autoritativo do ciclo de vida e ao Dispatch Engine.
        </DSCardContent>
      </DSCard>

      <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <DSInput className="pl-9" placeholder="Buscar corrida, passageiro, motorista, placa ou endereço" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="todas">Todas</option>
          <option value="ativas">Ativas</option>
          <option value="agendadas">Agendadas</option>
          <option value="finalizadas">Finalizadas</option>
          <option value="canceladas">Canceladas/expiradas</option>
        </select>
      </div>

      {loading ? (
        <Loading label="Carregando corridas..." />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Car} title="Nenhuma corrida encontrada" description="Ajuste os filtros ou aguarde novas solicitações." />
      ) : (
        <div className="space-y-2">
          {filtered.map((ride) => {
            const passenger = passengerById.get(ride.passenger_id);
            return (
              <DSCard key={ride.id}>
                <DSCardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs text-primary">{ride.id}</p>
                      <p className="mt-1 text-sm font-semibold">{ride.origin_name} → {ride.destination_name}</p>
                      <p className="text-xs text-muted-foreground">Passageiro: {passenger?.name || ride.passenger_id.slice(0, 8)} · Motorista: {ride.driver_name || "Ainda não atribuído"}</p>
                    </div>
                    <DSBadge variant={rideVariant(ride.status)}>{ride.status}</DSBadge>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{ride.category}</span><span>•</span>
                    <span>{money(ride.final_price ?? ride.estimated_price)}</span><span>•</span>
                    <span>{ride.payment_method}</span><span>•</span>
                    <span>{formatDate(ride.created_at)}</span>
                  </div>
                  <DSButton variant="outline" size="sm" onClick={() => setSelected(ride)} className="gap-1"><Eye className="h-4 w-4" /> Detalhes</DSButton>
                </DSCardContent>
              </DSCard>
            );
          })}
        </div>
      )}

      {selected && (
        <DSCard className="mt-6 border-primary/20">
          <DSCardContent className="space-y-4 p-4 text-sm">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">Detalhes da corrida</h2>
              <DSButton variant="ghost" size="sm" className="ml-auto" onClick={() => setSelected(null)}>Fechar</DSButton>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Detail icon={MapPin} label="Origem" value={selected.origin_name} />
              <Detail icon={MapPin} label="Destino" value={selected.destination_name} />
              <Detail icon={Car} label="Categoria" value={selected.category} />
              <Detail icon={Clock} label="Distância" value={selected.distance_km == null ? "—" : `${selected.distance_km} km`} />
              <Detail icon={Clock} label="Duração" value={selected.duration_min == null ? "—" : `${selected.duration_min} min`} />
              <Detail icon={Car} label="Motorista" value={selected.driver_name || "Não atribuído"} />
            </div>
            <div className="rounded-xl border border-border p-3 text-xs text-muted-foreground">
              <p>Estimado: {money(selected.estimated_price)} · Final: {money(selected.final_price)} · Pagamento: {selected.payment_method}</p>
              <p className="mt-1">Tentativas de despacho: {selected.dispatch_attempts}</p>
              {selected.driver_vehicle_model && <p className="mt-1">Veículo: {[selected.driver_vehicle_model, selected.driver_vehicle_color, selected.driver_vehicle_plate].filter(Boolean).join(" · ")}</p>}
              {selected.cancellation_reason && <p className="mt-1 text-destructive">Cancelamento: {selected.cancellation_reason} {selected.cancelled_by ? `(${selected.cancelled_by})` : ""}</p>}
              {selected.passenger_rating != null && <p className="mt-1">Avaliação registrada do passageiro: {selected.passenger_rating}{selected.passenger_rating_comment ? ` — ${selected.passenger_rating_comment}` : ""}</p>}
              {selected.driver_rating != null && <p className="mt-1">Avaliação registrada do motorista: {selected.driver_rating}</p>}
            </div>
          </DSCardContent>
        </DSCard>
      )}
    </AdminLayout>
  );
}

function Detail({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground"><Icon className="h-3 w-3" /> {label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}
