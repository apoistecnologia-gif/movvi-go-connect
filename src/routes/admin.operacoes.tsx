/* eslint-disable @typescript-eslint/no-explicit-any -- Temporary Phase 8 bridge until generated Supabase types include canonical admin RPCs. */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Car,
  CheckCircle2,
  Circle,
  Route as RouteIcon,
  Search,
  Users,
} from "lucide-react";
import { Marker } from "@react-google-maps/api";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { MovviMap } from "@/components/MovviMap";
import {
  Caption,
  DSButton,
  DSCard,
  DSCardContent,
  DSInput,
  EmptyState,
  Loading,
  Metric,
  StatusPill,
} from "@/design-system";
import { formatDate } from "@/lib/formatters";
import { loadAdminAccess } from "@/lib/adminAccess";
import { updateAdminSosAlert } from "@/lib/adminControlPlane";
import { APOIS_ADMIN_MAP } from "@/lib/adminVisual";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/operacoes")({
  head: () => ({ meta: [{ title: "Central de Operações — Admin APOIS" }] }),
  component: OpsCenterPage,
});

type Driver = {
  id: string;
  user_id: string;
  name: string | null;
  is_online: boolean;
  current_lat: number | null;
  current_lng: number | null;
  last_location_at: string | null;
  category: string | null;
  city: string | null;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  vehicle_color: string | null;
  approval_status: string | null;
};

type Ride = {
  id: string;
  status: string;
  category: string | null;
  passenger_id: string;
  driver_id: string | null;
  driver_name: string | null;
  origin_name: string | null;
  destination_name: string | null;
  payment_method: string | null;
  created_at: string;
  accepted_at: string | null;
  driver_arrived_at: string | null;
  started_at: string | null;
  completed_at: string | null;
};

type SosSeverity = "critical" | "high" | "medical" | "security";

type Sos = {
  id: string;
  user_id: string;
  driver_id: string | null;
  ride_id: string | null;
  lat: number | null;
  lng: number | null;
  message: string | null;
  severity: SosSeverity;
  status: "open" | "acknowledged" | "resolved" | "cancelled";
  created_at: string;
  updated_at: string;
};

type Passenger = {
  id: string;
  name: string | null;
  phone: string | null;
  city: string | null;
};

type SosActor =
  | { kind: "driver"; name: string; driver: Driver | null }
  | { kind: "passenger"; name: string; passenger: Passenger | null };

const ACTIVE_RIDE_STATUSES = [
  "procurar_motorista",
  "motorista_a_caminho",
  "motorista_chegou",
  "em_viagem",
];

const STATUS_LABEL: Record<string, string> = {
  procurar_motorista: "Buscando motorista",
  motorista_a_caminho: "Motorista a caminho",
  motorista_chegou: "Motorista no local",
  em_viagem: "Em viagem",
};

function OpsCenterPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [rides, setRides] = useState<Ride[]>([]);
  const [sos, setSos] = useState<Sos[]>([]);
  const [sosDrivers, setSosDrivers] = useState<Map<string, Driver>>(new Map());
  const [passengers, setPassengers] = useState<Map<string, Passenger>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busyAlert, setBusyAlert] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);

  async function loadAll() {
    setLoading(true);
    const db = supabase as any;
    const [driverResult, rideResult, sosResult] = await Promise.all([
      db
        .from("drivers")
        .select(
          "id,user_id,name,is_online,current_lat,current_lng,last_location_at,category,city,vehicle_model,vehicle_plate,vehicle_color,approval_status",
        )
        .eq("approval_status", "aprovado")
        .order("is_online", { ascending: false }),
      db
        .from("rides")
        .select(
          "id,status,category,passenger_id,driver_id,driver_name,origin_name,destination_name,payment_method,created_at,accepted_at,driver_arrived_at,started_at,completed_at",
        )
        .in("status", ACTIVE_RIDE_STATUSES)
        .order("created_at", { ascending: false }),
      db
        .from("sos_alerts")
        .select(
          "id,user_id,driver_id,ride_id,lat,lng,message,severity,status,created_at,updated_at",
        )
        .in("status", ["open", "acknowledged"])
        .order("created_at", { ascending: false }),
    ]);

    if (driverResult.error) toast.error("Motoristas: " + driverResult.error.message);
    if (rideResult.error) toast.error("Corridas: " + rideResult.error.message);
    if (sosResult.error) toast.error("SOS: " + sosResult.error.message);

    const nextDrivers = (driverResult.data ?? []) as Driver[];
    const nextRides = (rideResult.data ?? []) as Ride[];
    const nextSos = (sosResult.data ?? []) as Sos[];
    setDrivers(nextDrivers);
    setRides(nextRides);
    setSos(nextSos);

    const passengerIds = [
      ...new Set([
        ...nextRides.map((ride) => ride.passenger_id),
        ...nextSos.filter((alert) => alert.driver_id === null).map((alert) => alert.user_id),
      ]),
    ];
    if (passengerIds.length) {
      const passengerResult = await db
        .from("users")
        .select("id,name,phone,city")
        .in("id", passengerIds);
      if (!passengerResult.error) {
        setPassengers(
          new Map(
            (passengerResult.data ?? []).map((passenger: Passenger) => [passenger.id, passenger]),
          ),
        );
      }
    } else {
      setPassengers(new Map());
    }

    const sosDriverIds = [
      ...new Set(
        nextSos
          .map((alert) => alert.driver_id)
          .filter((driverId): driverId is string => Boolean(driverId)),
      ),
    ];
    if (sosDriverIds.length) {
      const sosDriverResult = await db
        .from("drivers")
        .select(
          "id,user_id,name,is_online,current_lat,current_lng,last_location_at,category,city,vehicle_model,vehicle_plate,vehicle_color,approval_status",
        )
        .in("id", sosDriverIds);
      if (!sosDriverResult.error) {
        setSosDrivers(
          new Map((sosDriverResult.data ?? []).map((driver: Driver) => [driver.id, driver])),
        );
      } else {
        setSosDrivers(new Map());
      }
    } else {
      setSosDrivers(new Map());
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadAll();
    void loadAdminAccess().then((access) =>
      setCanManage(Boolean(access?.permissions.includes("operations.manage"))),
    );
    const channel = supabase
      .channel("admin-ops-canonical")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "drivers" },
        () => void loadAll(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rides" },
        () => void loadAll(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sos_alerts" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            toast.error("Novo alerta SOS recebido na Central de Operações.");
          }
          void loadAll();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const onlineDrivers = useMemo(() => drivers.filter((driver) => driver.is_online), [drivers]);
  const busyDriverIds = useMemo(
    () => new Set(rides.map((ride) => ride.driver_id).filter(Boolean) as string[]),
    [rides],
  );
  const availableDrivers = onlineDrivers.filter((driver) => !busyDriverIds.has(driver.id));
  const searchingRides = rides.filter((ride) => ride.status === "procurar_motorista");
  const inProgressRides = rides.filter((ride) => ride.status !== "procurar_motorista");

  const term = search.trim().toLowerCase();
  const filteredRides = rides.filter((ride) => {
    if (!term) return true;
    const passenger = passengers.get(ride.passenger_id);
    return [
      ride.id,
      ride.driver_name,
      passenger?.name,
      passenger?.phone,
      ride.origin_name,
      ride.destination_name,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(term);
  });

  const mapCenter = useMemo(() => {
    const alert = sos.find((item) => item.lat != null && item.lng != null);
    if (alert?.lat != null && alert.lng != null) return { lat: alert.lat, lng: alert.lng };
    const driver = onlineDrivers.find(
      (item) => item.current_lat != null && item.current_lng != null,
    );
    return driver?.current_lat != null && driver.current_lng != null
      ? { lat: driver.current_lat, lng: driver.current_lng }
      : null;
  }, [onlineDrivers, sos]);

  function getSosActor(alert: Sos): SosActor {
    if (alert.driver_id !== null) {
      const driver = sosDrivers.get(alert.driver_id) ?? null;
      return { kind: "driver", name: driver?.name ?? "Motorista", driver };
    }
    const passenger = passengers.get(alert.user_id) ?? null;
    return { kind: "passenger", name: passenger?.name ?? "Passageiro", passenger };
  }

  async function setSosStatus(alert: Sos, status: "acknowledged" | "resolved") {
    if (!canManage) {
      toast.error("Sua função administrativa possui somente leitura operacional.");
      return;
    }
    setBusyAlert(alert.id);
    try {
      await updateAdminSosAlert(alert.id, status);
      toast.success(
        status === "acknowledged" ? "SOS assumido pela operação" : "SOS marcado como resolvido",
      );
      await loadAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar SOS.");
    } finally {
      setBusyAlert(null);
    }
  }

  return (
    <AdminLayout
      title="Central de Operações"
      description="Motoristas, corridas ativas e alertas SOS no schema canônico"
      actions={
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
          <Circle className="h-2 w-2 fill-current" /> Ao vivo
        </span>
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
        <Kpi label="Online" value={onlineDrivers.length} />
        <Kpi label="Disponíveis" value={availableDrivers.length} />
        <Kpi label="Buscando" value={searchingRides.length} />
        <Kpi label="Em atendimento" value={inProgressRides.length} />
        <Kpi label="SOS ativos" value={sos.length} danger={sos.length > 0} />
      </div>

      {sos.length > 0 && (
        <div className="mb-4 space-y-2">
          {sos.map((alert) => {
            const actor = getSosActor(alert);
            const vehicle =
              actor.kind === "driver"
                ? [actor.driver?.vehicle_model, actor.driver?.vehicle_color, actor.driver?.vehicle_plate]
                    .filter(Boolean)
                    .join(" · ")
                : "";
            return (
              <DSCard key={alert.id} className="border-destructive/50 bg-destructive/10">
                <DSCardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm">SOS {alert.severity.toUpperCase()}</strong>
                      <StatusPill
                        status={alert.status === "open" ? "cancelled" : "searching"}
                        label={alert.status === "open" ? "Aberto" : "Assumido"}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {actor.kind === "driver" ? "MOTORISTA" : "PASSAGEIRO"}: {actor.name} · {formatDate(alert.created_at)}
                    </p>
                    {vehicle ? <p className="mt-1 text-xs text-muted-foreground">Veículo: {vehicle}</p> : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {alert.ride_id ? `Corrida: ${alert.ride_id.slice(0, 8)}` : "Corrida: não associada"}
                      {alert.lat != null && alert.lng != null
                        ? ` · Localização SOS: ${alert.lat.toFixed(5)}, ${alert.lng.toFixed(5)}`
                        : " · Localização SOS: indisponível"}
                    </p>
                    {alert.message && <p className="mt-1 text-sm">{alert.message}</p>}
                  </div>
                  {canManage ? (
                    <div className="flex gap-2">
                      {alert.status === "open" && (
                        <DSButton
                          size="sm"
                          variant="outline"
                          disabled={busyAlert === alert.id}
                          onClick={() => void setSosStatus(alert, "acknowledged")}
                        >
                          Assumir
                        </DSButton>
                      )}
                      <DSButton
                        size="sm"
                        disabled={busyAlert === alert.id}
                        onClick={() => void setSosStatus(alert, "resolved")}
                        className="gap-1"
                      >
                        <CheckCircle2 className="h-4 w-4" /> Resolver
                      </DSButton>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Somente leitura</span>
                  )}
                </DSCardContent>
              </DSCard>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <DSCard className="overflow-hidden">
          <DSCardContent className="p-0">
            <div className="h-[420px] w-full">
              <MovviMap center={mapCenter}>
                {typeof window !== "undefined" && (window as any).google?.maps
                  ? onlineDrivers.map((driver) =>
                      driver.current_lat != null && driver.current_lng != null ? (
                        <Marker
                          key={`driver-${driver.id}`}
                          position={{ lat: driver.current_lat, lng: driver.current_lng }}
                          title={driver.name ?? "Motorista APOIS"}
                          icon={{
                            path: (window as any).google.maps.SymbolPath.CIRCLE,
                            scale: 8,
                            fillColor: busyDriverIds.has(driver.id)
                              ? APOIS_ADMIN_MAP.goldStrong
                              : APOIS_ADMIN_MAP.gold,
                            fillOpacity: 1,
                            strokeColor: APOIS_ADMIN_MAP.black,
                            strokeWeight: 2,
                          }}
                        />
                      ) : null,
                    )
                  : null}
                {typeof window !== "undefined" && (window as any).google?.maps
                  ? sos.map((alert) =>
                      alert.lat != null && alert.lng != null ? (
                        <Marker
                          key={`sos-${alert.id}`}
                          position={{ lat: alert.lat, lng: alert.lng }}
                          title="SOS APOIS"
                          icon={{
                            path: (window as any).google.maps.SymbolPath.CIRCLE,
                            scale: 10,
                            fillColor: APOIS_ADMIN_MAP.danger,
                            fillOpacity: 1,
                            strokeColor: APOIS_ADMIN_MAP.white,
                            strokeWeight: 3,
                          }}
                        />
                      ) : null,
                    )
                  : null}
              </MovviMap>
            </div>
          </DSCardContent>
        </DSCard>

        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <DSInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar corrida, passageiro, origem ou destino"
              className="pl-9"
            />
          </div>

          {loading ? (
            <Loading label="Carregando operação..." />
          ) : filteredRides.length === 0 ? (
            <EmptyState
              icon={RouteIcon}
              title="Sem corridas ativas"
              description="As corridas em andamento aparecerão aqui."
            />
          ) : (
            <div className="space-y-2">
              {filteredRides.map((ride) => {
                const passenger = passengers.get(ride.passenger_id);
                return (
                  <DSCard key={ride.id}>
                    <DSCardContent className="space-y-2 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] text-primary">
                          {ride.id.slice(0, 8)}
                        </span>
                        <StatusPill
                          status={
                            ride.status === "procurar_motorista" ? "searching" : "driverComing"
                          }
                          label={STATUS_LABEL[ride.status] ?? ride.status}
                        />
                      </div>
                      <p className="truncate text-sm font-semibold">
                        {passenger?.name ?? "Passageiro"} · {ride.category ?? "—"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {ride.origin_name ?? "Origem"} → {ride.destination_name ?? "Destino"}
                      </p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                        <span>Motorista: {ride.driver_name ?? "Ainda não atribuído"}</span>
                        <span>Pagamento: {ride.payment_method ?? "—"}</span>
                        <span>{formatDate(ride.created_at)}</span>
                      </div>
                    </DSCardContent>
                  </DSCard>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <InfoCard icon={Car} title="Motoristas" value={`${onlineDrivers.length} online`} />
        <InfoCard
          icon={Users}
          title="Passageiros ativos"
          value={`${new Set(rides.map((ride) => ride.passenger_id)).size}`}
        />
        <InfoCard icon={RouteIcon} title="Corridas ativas" value={`${rides.length}`} />
      </div>
    </AdminLayout>
  );
}

function Kpi({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <DSCard className={danger ? "border-destructive/50 bg-destructive/10" : undefined}>
      <DSCardContent className="p-3">
        <Caption>{label}</Caption>
        <Metric>{value}</Metric>
      </DSCardContent>
    </DSCard>
  );
}

function InfoCard({
  icon: Icon,
  title,
  value,
}: {
  icon: typeof Car;
  title: string;
  value: string;
}) {
  return (
    <DSCard>
      <DSCardContent className="flex items-center gap-3 p-4">
        <Icon className="h-5 w-5 text-primary" />
        <div>
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="font-semibold">{value}</p>
        </div>
      </DSCardContent>
    </DSCard>
  );
}
