import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { Marker, Polyline } from "@react-google-maps/api";
import {
  AlertTriangle, Crosshair, Power, MapPin, Navigation2,
} from "lucide-react";
import { MovviMap } from "@/components/MovviMap";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, DRIVER_NAV } from "@/components/BottomNav";
import { BottomSheet } from "@/components/BottomSheet";
import { supabase } from "@/integrations/supabase/client";
import { BRASILIA_CENTER } from "@/lib/googleMaps";
import { useDriverBroadcast } from "@/hooks/useDriverBroadcast";
import { computeRoute } from "@/lib/routes.functions";
import { acceptRide, rejectRide, updateRidePhase } from "@/lib/ride.functions";
import { formatBRL } from "@/lib/rideCategories";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/motorista/app")({
  head: () => ({ meta: [{ title: "App do Motorista — MOVVI DRIVE" }] }),
  component: MotoristaApp,
});

type LatLng = { lat: number; lng: number };
type RideRow = Database["public"]["Tables"]["rides"]["Row"];

function decode(encoded: string): LatLng[] {
  const points: LatLng[] = []; let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push({ lat: lat * 1e-5, lng: lng * 1e-5 });
  }
  return points;
}

function MotoristaApp() {
  const navigate = useNavigate();
  const callAccept  = useServerFn(acceptRide);
  const callReject  = useServerFn(rejectRide);
  const callPhase   = useServerFn(updateRidePhase);
  const callRoute   = useServerFn(computeRoute);

  const [userId, setUserId] = useState<string | null>(null);
  const [position, setPosition] = useState<LatLng | null>(null);
  const [online, setOnline] = useState(false);
  const [statusBlock, setStatusBlock] = useState<string | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const [incoming, setIncoming] = useState<RideRow | null>(null);
  const [active, setActive] = useState<RideRow | null>(null);
  const [countdown, setCountdown] = useState(15);

  const [polyline, setPolyline] = useState<LatLng[]>([]);

  const mapRef = useRef<google.maps.Map | null>(null);

  useDriverBroadcast(userId, online, position);

  // sessão + aprovação
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { navigate({ to: "/motorista/login" }); return; }
      setUserId(u.user.id);
      const { data } = await supabase.from("drivers")
        .select("approval_status").eq("user_id", u.user.id).maybeSingle();
      if (!data || data.approval_status !== "approved") {
        setStatusBlock(
          data?.approval_status === "rejected" ? "Seu cadastro foi recusado."
          : data?.approval_status === "blocked" ? "Sua conta está bloqueada."
          : "Seu cadastro está em análise.");
      }
    })();
  }, [navigate]);

  // GPS
  useEffect(() => {
    if (!("geolocation" in navigator)) { setGpsError("GPS indisponível"); return; }
    const id = navigator.geolocation.watchPosition(
      (pos) => { setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGpsError(null); },
      (err) => setGpsError(err.message),
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 10000 });
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Desliga online ao sair
  useEffect(() => () => { if (online && userId)
    supabase.from("drivers").update({ is_online: false }).eq("user_id", userId).then();
  }, [online, userId]);

  // Realtime: ofertas para mim + corrida ativa
  useEffect(() => {
    if (!userId) return;
    const ch = supabase.channel(`driver-rides-${userId}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "rides", filter: `current_offer_driver_id=eq.${userId}` },
        (p) => {
          const r = p.new as RideRow;
          if (r.status === "offered_to_driver" && !active && !incoming) {
            setIncoming(r); setCountdown(15);
            try { new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=").play().catch(()=>{}); } catch {}
            if (navigator.vibrate) navigator.vibrate([300, 120, 300]);
          }
        })
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "rides", filter: `driver_id=eq.${userId}` },
        (p) => {
          const r = p.new as RideRow;
          setActive(r);
          if (r.status === "completed" || r.status === "cancelled") {
            setTimeout(() => setActive(null), 4000);
            setPolyline([]);
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, active, incoming]);

  // Countdown da oferta
  useEffect(() => {
    if (!incoming) return;
    if (countdown <= 0) { handleReject(); return; }
    const t = window.setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [incoming, countdown]);

  async function handleAccept() {
    if (!incoming) return;
    try {
      const r = await callAccept({ data: { rideId: incoming.id } });
      setActive(r as RideRow); setIncoming(null);
    } catch (e) { console.error(e); setIncoming(null); }
  }
  async function handleReject() {
    if (!incoming) return;
    try { await callReject({ data: { rideId: incoming.id } }); }
    finally { setIncoming(null); }
  }

  // Rota: até passageiro OU até destino
  useEffect(() => {
    if (!active || !position) { setPolyline([]); return; }
    const goingToPickup = active.status === "driver_assigned" || active.status === "driver_arrived";
    const dest = goingToPickup
      ? { lat: active.origin_lat, lng: active.origin_lng }
      : active.status === "in_progress"
        ? { lat: active.destination_lat, lng: active.destination_lng }
        : null;
    if (!dest) { setPolyline([]); return; }
    callRoute({ data: { origin: position, destination: dest } })
      .then((res) => {
        setPolyline(decode(res.encodedPolyline));
        if (mapRef.current) {
          const b = new google.maps.LatLngBounds();
          b.extend(position); b.extend(dest);
          mapRef.current.fitBounds(b, 80);
        }
      })
      .catch(() => {});
  }, [active?.id, active?.status, position?.lat, position?.lng]);

  function recenter() {
    if (position && mapRef.current) { mapRef.current.panTo(position); mapRef.current.setZoom(16); }
  }

  const center = position ?? BRASILIA_CENTER;
  const showActive = active && (active.status === "driver_assigned"
    || active.status === "driver_arrived" || active.status === "in_progress"
    || active.status === "completed" || active.status === "cancelled");

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0">
        <MovviMap center={center} zoom={position ? 16 : 13} height="100%"
          onLoad={(m) => { mapRef.current = m; }}>
          {position && (
            <Marker position={position} icon={{
              path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
              scale: 6, fillColor: online ? "#8DD92B" : "#94a3b8",
              fillOpacity: 1, strokeColor: "#05070D", strokeWeight: 2,
            }} />
          )}
          {active && (
            <>
              <Marker position={{ lat: active.origin_lat, lng: active.origin_lng }} icon={{
                path: google.maps.SymbolPath.CIRCLE, scale: 7,
                fillColor: "#3b82f6", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2,
              }} />
              <Marker position={{ lat: active.destination_lat, lng: active.destination_lng }} icon={{
                path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z",
                fillColor: "#ef4444", fillOpacity: 1, strokeColor: "#05070D",
                strokeWeight: 2, scale: 1.4, anchor: new google.maps.Point(12, 22),
              }} />
            </>
          )}
          {polyline.length > 0 && (
            <Polyline path={polyline} options={{
              strokeColor: "#8DD92B", strokeOpacity: 0.95, strokeWeight: 6, geodesic: true,
            }} />
          )}
        </MovviMap>
      </div>

      <MovviHeader variant="floating" logoutRedirect="/" />

      {gpsError && (
        <div className="absolute left-1/2 top-20 z-10 -translate-x-1/2 rounded-full bg-destructive/90 px-4 py-1.5 text-xs text-destructive-foreground shadow-lg backdrop-blur">
          GPS: {gpsError}
        </div>
      )}

      {statusBlock && !showActive && (
        <div className="absolute left-1/2 top-24 z-20 -translate-x-1/2 max-w-xs rounded-xl bg-card/95 px-4 py-3 text-center shadow-2xl ring-1 ring-border backdrop-blur-md">
          <div className="flex items-center justify-center gap-2 text-yellow-400">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Aguardando aprovação</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{statusBlock}</p>
          <button onClick={() => navigate({ to: "/motorista/status" })}
            className="mt-2 text-xs font-medium text-primary hover:underline">
            Ver status do cadastro →
          </button>
        </div>
      )}

      {/* botões flutuantes laterais */}
      <div className="absolute bottom-44 right-4 z-20 flex flex-col gap-2">
        <button onClick={recenter}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-card text-foreground shadow-lg ring-1 ring-border hover:ring-primary/40">
          <Crosshair className="h-5 w-5" />
        </button>
      </div>

      {/* Botão ONLINE flutuante quando sem corrida */}
      {!showActive && !incoming && (
        <div className="absolute bottom-28 left-1/2 z-20 -translate-x-1/2">
          <button type="button" disabled={!!statusBlock}
            onClick={() => setOnline((v) => !v)}
            className={`group flex h-20 w-20 items-center justify-center rounded-full shadow-2xl ring-4 transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
              online ? "bg-primary text-primary-foreground ring-primary/30 hover:brightness-110"
                     : "bg-card text-foreground ring-border hover:ring-primary/40"}`}
            aria-label={online ? "Ficar offline" : "Ficar online"}>
            <Power className="h-7 w-7" />
          </button>
          <div className="mt-2 text-center text-xs font-semibold uppercase tracking-wider">
            {online ? <span className="text-primary">Online</span> : <span className="text-muted-foreground">Offline</span>}
          </div>
        </div>
      )}

      {/* CARTÃO DE OFERTA */}
      {incoming && (
        <IncomingCard ride={incoming} countdown={countdown}
          onAccept={handleAccept} onReject={handleReject} />
      )}

      {/* PAINEL DE CORRIDA ATIVA */}
      {showActive && active && (
        <BottomSheet snap="mid">
          <ActivePanel ride={active}
            onArrive={() => callPhase({ data: { rideId: active.id, status: "driver_arrived" } })}
            onStart={() => callPhase({ data: { rideId: active.id, status: "in_progress" } })}
            onComplete={() => callPhase({ data: { rideId: active.id, status: "completed",
              final_price: active.estimated_price ? Number(active.estimated_price) : undefined } })}
          />
        </BottomSheet>
      )}

      <BottomNav items={DRIVER_NAV} floating />
    </div>
  );
}

function IncomingCard({ ride, countdown, onAccept, onReject }: {
  ride: RideRow; countdown: number; onAccept: () => void; onReject: () => void;
}) {
  return (
    <div className="absolute inset-x-4 top-24 z-40 animate-in fade-in slide-in-from-top-4">
      <div className="rounded-2xl bg-card/95 p-4 shadow-2xl ring-2 ring-primary backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-primary px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-primary-foreground">
            Nova corrida
          </span>
          <span className="font-mono text-lg font-bold text-primary">{countdown}s</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Metric label="Distância" value={ride.distance_km ? `${ride.distance_km} km` : "—"} />
          <Metric label="Tempo" value={ride.duration_min ? `${ride.duration_min} min` : "—"} />
          <Metric label="Ganho" value={ride.estimated_price ? formatBRL(Number(ride.estimated_price)) : "—"} highlight />
        </div>
        <div className="mt-3 space-y-1 text-xs">
          <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-3.5 w-3.5 text-blue-400" />
            <span className="line-clamp-1">{ride.origin_name}</span></div>
          <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-3.5 w-3.5 text-destructive" />
            <span className="line-clamp-1">{ride.destination_name}</span></div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button onClick={onReject}
            className="rounded-xl border border-border bg-background py-3 text-sm font-semibold text-muted-foreground hover:text-foreground">
            Recusar
          </button>
          <button onClick={onAccept}
            className="rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 hover:brightness-110">
            Aceitar
          </button>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl bg-background/60 px-2 py-2 ring-1 ring-border">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-bold ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function ActivePanel({ ride, onArrive, onStart, onComplete }: {
  ride: RideRow; onArrive: () => void; onStart: () => void; onComplete: () => void;
}) {
  const phase = ride.status;
  if (phase === "completed") return (
    <div className="text-center">
      <div className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary text-2xl">✓</div>
      <h2 className="text-lg font-bold">Corrida concluída</h2>
      {ride.final_price && <p className="mt-1 text-primary font-semibold">{formatBRL(Number(ride.final_price))}</p>}
    </div>
  );
  if (phase === "cancelled") return (
    <div className="text-center text-sm text-muted-foreground">Corrida cancelada.</div>
  );
  const label =
    phase === "driver_assigned" ? "Indo buscar passageiro" :
    phase === "driver_arrived"  ? "Aguardando passageiro" :
    "Em viagem";
  const dest = phase === "in_progress" ? ride.destination_name : ride.origin_name;
  return (
    <div>
      <div className="mb-2 text-center text-[11px] font-semibold uppercase tracking-widest text-primary">{label}</div>
      <div className="rounded-2xl bg-background/60 p-3 ring-1 ring-border">
        <div className="flex items-center gap-2 text-sm">
          <Navigation2 className="h-4 w-4 text-primary" />
          <span className="line-clamp-1">{dest}</span>
        </div>
        {ride.estimated_price && (
          <div className="mt-2 text-xs text-muted-foreground">
            Ganho previsto: <span className="font-semibold text-primary">{formatBRL(Number(ride.estimated_price))}</span>
          </div>
        )}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2">
        {phase === "driver_assigned" && (
          <button onClick={onArrive}
            className="rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground hover:brightness-110">Cheguei ao local</button>
        )}
        {phase === "driver_arrived" && (
          <button onClick={onStart}
            className="rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground hover:brightness-110">Iniciar corrida</button>
        )}
        {phase === "in_progress" && (
          <button onClick={onComplete}
            className="rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground hover:brightness-110">Finalizar corrida</button>
        )}
      </div>
    </div>
  );
}
