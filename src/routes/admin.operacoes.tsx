/* eslint-disable @typescript-eslint/no-explicit-any -- Temporary Phase 8 bridge until generated Supabase types include canonical admin RPCs. */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
type SosStatus = "open" | "acknowledged" | "resolved" | "cancelled";

type Sos = {
  id: string;
  user_id: string;
  driver_id: string | null;
  ride_id: string | null;
  lat: number | null;
  lng: number | null;
  message: string | null;
  severity: SosSeverity;
  status: SosStatus;
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

const SOS_SEVERITIES: SosSeverity[] = ["critical", "high", "medical", "security"];
const SOS_STATUSES: SosStatus[] = ["open", "acknowledged", "resolved", "cancelled"];

function cleanText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text || fallback;
}

function safeDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function safeCoordinate(latValue: unknown, lngValue: unknown) {
  const lat = Number(latValue);
  const lng = Number(lngValue);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function normalizeSosSeverity(value: unknown): SosSeverity {
  const normalized = cleanText(value).toLowerCase();
  return SOS_SEVERITIES.includes(normalized as SosSeverity) ? (normalized as SosSeverity) : "security";
}

function normalizeSosStatus(value: unknown): SosStatus {
  const normalized = cleanText(value).toLowerCase();
  return SOS_STATUSES.includes(normalized as SosStatus) ? (normalized as SosStatus) : "open";
}

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestRef = useRef(0);

  async function loadAll() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    const db = supabase as any;
    try {
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
      if (requestId !== requestRef.current) return;
      if (driverResult.error) throw driverResult.error;
      if (rideResult.error) throw rideResult.error;
      if (sosResult.error) throw sosResult.error;

      const nextDrivers = ((driverResult.data ?? []) as Driver[])
        .filter((driver) => Boolean(cleanText(driver.id)))
        .map((driver) => {
          const coordinate = safeCoordinate(driver.current_lat, driver.current_lng);
          return {
            ...driver,
            id: cleanText(driver.id),
            user_id: cleanText(driver.user_id),
            name: cleanText(driver.name) || null,
            is_online: driver.is_online === true,
            current_lat: coordinate?.lat ?? null,
            current_lng: coordinate?.lng ?? null,
            last_location_at: safeDate(driver.last_location_at),
            category: cleanText(driver.category) || null,
            city: cleanText(driver.city) || null,
            vehicle_model: cleanText(driver.vehicle_model) || null,
            vehicle_plate: cleanText(driver.vehicle_plate).toUpperCase().replace(/\s+/g, "") || null,
            vehicle_color: cleanText(driver.vehicle_color) || null,
            approval_status: cleanText(driver.approval_status) || null,
          };
        });
      const nextRides = ((rideResult.data ?? []) as Ride[])
        .filter((ride) => Boolean(cleanText(ride.id)) && Boolean(cleanText(ride.passenger_id)))
        .map((ride) => ({
          ...ride,
          id: cleanText(ride.id),
          status: cleanText(ride.status, "procurar_motorista").toLowerCase(),
          category: cleanText(ride.category) || null,
          passenger_id: cleanText(ride.passenger_id),
          driver_id: cleanText(ride.driver_id) || null,
          driver_name: cleanText(ride.driver_name) || null,
          origin_name: cleanText(ride.origin_name) || null,
          destination_name: cleanText(ride.destination_name) || null,
          payment_method: cleanText(ride.payment_method) || null,
          created_at: safeDate(ride.created_at) ?? "",
          accepted_at: safeDate(ride.accepted_at),
          driver_arrived_at: safeDate(ride.driver_arrived_at),
          started_at: safeDate(ride.started_at),
          completed_at: safeDate(ride.completed_at),
        }));
      const nextSos = ((sosResult.data ?? []) as Sos[])
        .filter((alert) => Boolean(cleanText(alert.id)) && Boolean(cleanText(alert.user_id)))
        .map((alert) => {
          const coordinate = safeCoordinate(alert.lat, alert.lng);
          return {
            ...alert,
            id: cleanText(alert.id),
            user_id: cleanText(alert.user_id),
            driver_id: cleanText(alert.driver_id) || null,
            ride_id: cleanText(alert.ride_id) || null,
            lat: coordinate?.lat ?? null,
            lng: coordinate?.lng ?? null,
            message: cleanText(alert.message).slice(0, 1000) || null,
            severity: normalizeSosSeverity(alert.severity),
            status: normalizeSosStatus(alert.status),
            created_at: safeDate(alert.created_at) ?? "",
            updated_at: safeDate(alert.updated_at) ?? "",
          };
        });
      setDrivers(nextDrivers);
      setRides(nextRides);
      setSos(nextSos);

      const passengerIds = [
        ...new Set([
          ...nextRides.map((ride) => ride.passenger_id),
          ...nextSos.filter((alert) => alert.driver_id === null).map((alert) => alert.user_id),
        ].filter(Boolean)),
      ];
      if (passengerIds.length) {
        const passengerResult = await db.from("users").select("id,name,phone,city").in("id", passengerIds);
        if (requestId !== requestRef.current) return;
        if (passengerResult.error) throw passengerResult.error;
        setPassengers(
          new Map(
            ((passengerResult.data ?? []) as Passenger[])
              .filter((passenger) => Boolean(cleanText(passenger.id)))
              .map((passenger) => [
                cleanText(passenger.id),
                {
                  ...passenger,
                  id: cleanText(passenger.id),
                  name: cleanText(passenger.name) || null,
                  phone: cleanText(passenger.phone) || null,
                  city: cleanText(passenger.city) || null,
                },
              ]),
          ),
        );
      } else {
        setPassengers(new Map());
      }

      const sosDriverIds = [...new Set(nextSos.map((alert) => alert.driver_id).filter((id): id is string => Boolean(id)))];
      if (sosDriverIds.length) {
        const sosDriverResult = await db
          .from("drivers")
          .select(
            "id,user_id,name,is_online,current_lat,current_lng,last_location_at,category,city,vehicle_model,vehicle_plate,vehicle_color,approval_status",
          )
          .in("id", sosDriverIds);
        if (requestId !== requestRef.current) return;
        if (sosDriverResult.error) throw sosDriverResult.error;
        setSosDrivers(
          new Map(
            ((sosDriverResult.data ?? []) as Driver[])
              .filter((driver) => Boolean(cleanText(driver.id)))
              .map((driver) => [cleanText(driver.id), driver]),
          ),
        );
      } else {
        setSosDrivers(new Map());
      }
    } catch (error) {
      if (requestId !== requestRef.current) return;
      setDrivers([]);
      setRides([]);
      setSos([]);
      setSosDrivers(new Map());
      setPassengers(new Map());
      setLoadError("Não foi possível carregar a Central de Operações agora. Tente novamente.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha na Central de Operações", error);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
    let alive = true;
    let refreshTimer: number | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void loadAll(), 250);
    };
    void loadAdminAccess()
      .then((access) => {
        if (alive) setCanManage(Boolean(access?.permissions.includes("operations.manage")));
      })
      .catch((error) => {
        if (alive) setCanManage(false);
        if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao carregar permissão de operações", error);
      });
    const channel = supabase
      .channel("admin-ops-canonical")
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "rides" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "sos_alerts" }, (payload) => {
        if (payload.eventType === "INSERT") toast.error("Novo alerta SOS recebido na Central de Operações.");
        scheduleRefresh();
      })
      .subscribe();
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      requestRef.current += 1;
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, []);

  const onlineDrivers = useMemo(() => drivers.filter((driver) => driver.is_online), [drivers]);
  const busyDriverIds = useMemo(
    () => new Set(rides.map((ride) => ride.driver_id).filter((id): id is string => Boolean(id))),
    [rides],
  );
  const availableDrivers = useMemo(
    () => onlineDrivers.filter((driver) => !busyDriverIds.has(driver.id)),
    [busyDriverIds, onlineDrivers],
  );
  const searchingRides = useMemo(() => rides.filter((ride) => ride.status === "procurar_motorista"), [rides]);
  const inProgressRides = useMemo(() => rides.filter((ride) => ride.status !== "procurar_motorista"), [rides]);

  const term = search.trim().toLocaleLowerCase("pt-BR");
  const filteredRides = useMemo(
    () =>
      rides.filter((ride) => {
        if (!term) return true;
        const passenger = passengers.get(ride.passenger_id);
        return [ride.id, ride.driver_name, passenger?.name, passenger?.phone, ride.origin_name, ride.destination_name]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(term));
      }),
    [passengers, rides, term],
  );

  const mapCenter = useMemo(() => {
    const alert = sos.find((item) => safeCoordinate(item.lat, item.lng));
    const alertCoordinate = alert ? safeCoordinate(alert.lat, alert.lng) : null;
    if (alertCoordinate) return alertCoordinate;
    const driver = onlineDrivers.find((item) => safeCoordinate(item.current_lat, item.current_lng));
    return driver ? safeCoordinate(driver.current_lat, driver.current_lng) : null;
  }, [onlineDrivers, sos]);

  function getSosActor(alert: Sos): SosActor {
    if (alert.driver_id) {
      const driver = sosDrivers.get(alert.driver_id) ?? null;
      return { kind: "driver", name: cleanText(driver?.name, "Motorista"), driver };
    }
    const passenger = passengers.get(alert.user_id) ?? null;
    return { kind: "passenger", name: cleanText(passenger?.name, "Passageiro"), passenger };
  }

  async function setSosStatus(alert: Sos, status: "acknowledged" | "resolved") {
    if (!canManage) {
      toast.error("Sua função administrativa possui somente leitura operacional.");
      return;
    }
    if (busyAlert || !cleanText(alert.id)) return;
    if (status === "resolved") {
      const actor = getSosActor(alert);
      const confirmed = window.confirm(`Confirmar resolução do SOS de ${actor.name}?`);
      if (!confirmed) return;
    }
    setBusyAlert(alert.id);
    try {
      await updateAdminSosAlert(alert.id, status);
      toast.success(status === "acknowledged" ? "SOS assumido pela operação" : "SOS marcado como resolvido");
      await loadAll();
    } catch (error) {
      toast.error("Não foi possível atualizar o SOS. Tente novamente.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao atualizar SOS", error);
    } finally {
      setBusyAlert(null);
    }
  }

  return (
    <AdminLayout
      title="Central de Operações"
      description="Motoristas, corridas ativas e alertas SOS no schema canônico"
      actions={
        <span className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary/10 px-3 py-2 text-sm text-primary" role="status" aria-live="polite">
          <Circle className="h-2 w-2 fill-current" aria-hidden="true" /> Ao vivo
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

      {loadError ? (
        <DSCard className="mb-4 border-destructive/30 bg-destructive/5">
          <DSCardContent className="space-y-3 p-4" role="alert">
            <p className="text-sm font-medium text-destructive">{loadError}</p>
            <DSButton variant="outline" className="min-h-11" onClick={() => void loadAll()}>Tentar novamente</DSButton>
          </DSCardContent>
        </DSCard>
      ) : null}

      {sos.length > 0 && (
        <div className="mb-4 space-y-2" aria-live="polite">
          {sos.map((alert) => {
            const actor = getSosActor(alert);
            const vehicle = actor.kind === "driver"
              ? [actor.driver?.vehicle_model, actor.driver?.vehicle_color, actor.driver?.vehicle_plate].filter(Boolean).join(" · ")
              : "";
            const coordinate = safeCoordinate(alert.lat, alert.lng);
            return (
              <DSCard key={alert.id} className="border-destructive/50 bg-destructive/10">
                <DSCardContent className="flex min-w-0 flex-col gap-3 p-4 lg:flex-row lg:items-center">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm">SOS {alert.severity.toLocaleUpperCase("pt-BR")}</strong>
                      <StatusPill status={alert.status === "open" ? "cancelled" : "searching"} label={alert.status === "open" ? "Aberto" : "Assumido"} />
                    </div>
                    <p className="mt-1 break-words text-sm text-muted-foreground">
                      {actor.kind === "driver" ? "MOTORISTA" : "PASSAGEIRO"}: {actor.name} · {alert.created_at ? formatDate(alert.created_at) : "Data não informada"}
                    </p>
                    {vehicle ? <p className="mt-1 break-words text-sm text-muted-foreground">Veículo: {vehicle}</p> : null}
                    <p className="mt-1 break-words text-sm text-muted-foreground">
                      {alert.ride_id ? `Corrida: ${alert.ride_id.slice(0, 8)}` : "Corrida: não associada"}
                      {coordinate ? ` · Localização SOS: ${coordinate.lat.toFixed(5)}, ${coordinate.lng.toFixed(5)}` : " · Localização SOS: indisponível"}
                    </p>
                    {alert.message && <p className="mt-2 break-words text-sm leading-6">{alert.message}</p>}
                  </div>
                  {canManage ? (
                    <div className="flex flex-wrap gap-2">
                      {alert.status === "open" && (
                        <DSButton size="sm" variant="outline" disabled={Boolean(busyAlert)} aria-busy={busyAlert === alert.id} className="min-h-11" onClick={() => void setSosStatus(alert, "acknowledged")}>Assumir</DSButton>
                      )}
                      <DSButton size="sm" disabled={Boolean(busyAlert)} aria-busy={busyAlert === alert.id} onClick={() => void setSosStatus(alert, "resolved")} className="min-h-11 gap-2">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {busyAlert === alert.id ? "Atualizando…" : "Resolver"}
                      </DSButton>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Somente leitura</span>
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
            <div className="h-[clamp(320px,55vh,520px)] min-h-[320px] w-full min-w-0">
              <MovviMap center={mapCenter}>
                {typeof window !== "undefined" && (window as any).google?.maps
                  ? onlineDrivers.map((driver) => {
                      const coordinate = safeCoordinate(driver.current_lat, driver.current_lng);
                      if (!coordinate) return null;
                      return (
                        <Marker
                          key={`driver-${driver.id}`}
                          position={coordinate}
                          title={driver.name ?? "Motorista APOIS"}
                          icon={{
                            path: (window as any).google.maps.SymbolPath.CIRCLE,
                            scale: 8,
                            fillColor: busyDriverIds.has(driver.id) ? APOIS_ADMIN_MAP.goldStrong : APOIS_ADMIN_MAP.gold,
                            fillOpacity: 1,
                            strokeColor: APOIS_ADMIN_MAP.black,
                            strokeWeight: 2,
                          }}
                        />
                      );
                    })
                  : null}
                {typeof window !== "undefined" && (window as any).google?.maps
                  ? sos.map((alert) => {
                      const coordinate = safeCoordinate(alert.lat, alert.lng);
                      if (!coordinate) return null;
                      return (
                        <Marker
                          key={`sos-${alert.id}`}
                          position={coordinate}
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
                      );
                    })
                  : null}
              </MovviMap>
            </div>
          </DSCardContent>
        </DSCard>

        <div className="space-y-3">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <DSInput
              value={search}
              maxLength={160}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar corrida, passageiro, origem ou destino"
              className="min-h-11 pl-9 text-base"
              aria-label="Buscar corrida ativa"
            />
          </div>

          {loading ? (
            <div role="status" aria-live="polite"><Loading label="Carregando operação..." /></div>
          ) : filteredRides.length === 0 ? (
            <EmptyState
              icon={RouteIcon}
              title={search.trim() ? "Nenhuma corrida corresponde à busca" : "Sem corridas ativas"}
              description={search.trim() ? "Revise o termo pesquisado." : "As corridas em andamento aparecerão aqui."}
            />
          ) : (
            <div className="space-y-2">
              {filteredRides.map((ride) => {
                const passenger = passengers.get(ride.passenger_id);
                return (
                  <DSCard key={ride.id}>
                    <DSCardContent className="space-y-2 p-3">
                      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                        <span className="break-all font-mono text-xs text-primary">{ride.id.slice(0, 8)}</span>
                        <StatusPill status={ride.status === "procurar_motorista" ? "searching" : "driverComing"} label={STATUS_LABEL[ride.status] ?? "Status operacional"} />
                      </div>
                      <p className="break-words text-sm font-semibold">{passenger?.name ?? "Passageiro"} · {ride.category ?? "Categoria não informada"}</p>
                      <p className="break-words text-sm text-muted-foreground">{ride.origin_name ?? "Origem não informada"} → {ride.destination_name ?? "Destino não informado"}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                        <span className="break-words">Motorista: {ride.driver_name ?? "Ainda não atribuído"}</span>
                        <span>Pagamento: {ride.payment_method ?? "Não informado"}</span>
                        <span>{ride.created_at ? formatDate(ride.created_at) : "Data não informada"}</span>
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
        <InfoCard icon={Users} title="Passageiros ativos" value={`${new Set(rides.map((ride) => ride.passenger_id)).size}`} />
        <InfoCard icon={RouteIcon} title="Corridas ativas" value={`${rides.length}`} />
      </div>
    </AdminLayout>
  );
}

function Kpi({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  const safeValue = Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  return (
    <DSCard className={danger ? "border-destructive/50 bg-destructive/10" : undefined}>
      <DSCardContent className="min-w-0 p-3">
        <Caption className="break-words">{label}</Caption>
        <Metric className="tabular-nums">{safeValue}</Metric>
      </DSCardContent>
    </DSCard>
  );
}

function InfoCard({ icon: Icon, title, value }: { icon: typeof Car; title: string; value: string }) {
  return (
    <DSCard>
      <DSCardContent className="flex min-w-0 items-center gap-3 p-4">
        <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <p className="break-words text-sm text-muted-foreground">{title}</p>
          <p className="break-words font-semibold">{value}</p>
        </div>
      </DSCardContent>
    </DSCard>
  );
}
