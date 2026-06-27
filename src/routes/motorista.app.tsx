import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Marker, Polyline } from "@react-google-maps/api";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Crosshair,
  MapPin,
  Navigation2,
  Phone,
  Star,

  X,
  ChevronRight,
} from "lucide-react";
import { MovviMap } from "@/components/MovviMap";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, DRIVER_NAV } from "@/components/BottomNav";
import { MovviSheet, type MovviSheetHandle } from "@/components/MovviSheet";
import { supabase } from "@/integrations/supabase/client";
import {
  BRAZIL_CENTER,
  isBrazilCoordinate,
  purgeForeignMapCache,
} from "@/lib/googleMaps";
import { useDriverBroadcast } from "@/hooks/useDriverBroadcast";
import { computeRoute } from "@/lib/routes.functions";
import {
  aceitarCorrida,
  recusarCorrida,
  informarChegada,
  iniciarCorrida,
  finalizarCorrida,
  cancelarPeloMotorista,
} from "@/lib/rideLifecycle";
import { formatBRL } from "@/lib/rideCategories";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/motorista/app")({
  head: () => ({ meta: [{ title: "App do Motorista — MOVVI DRIVE" }] }),
  component: MotoristaApp,
});

type LatLng = { lat: number; lng: number };
type RideRow = Database["public"]["Tables"]["rides"]["Row"];
type Passenger = { name: string | null; phone: string | null };

function decodePolyline(encoded: string): LatLng[] {
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

function haversineKm(a: LatLng, b: LatLng) {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function MotoristaApp() {
  const navigate = useNavigate();
  const callAccept   = useServerFn(aceitarCorrida);
  const callReject   = useServerFn(recusarCorrida);
  const callArrive   = useServerFn(informarChegada);
  const callStart    = useServerFn(iniciarCorrida);
  const callComplete = useServerFn(finalizarCorrida);
  const callCancel   = useServerFn(cancelarPeloMotorista);
  const callRoute    = useServerFn(computeRoute);

  const [userId, setUserId] = useState<string | null>(null);
  const [driverName, setDriverName] = useState<string>("");
  const [position, setPosition] = useState<LatLng | null>(null);
  const [online, setOnline] = useState(false);
  const [statusBlock, setStatusBlock] = useState<string | null>(null);
  type GpsStatus = "prompt" | "loading" | "granted" | "denied" | "timeout" | "unavailable" | "error";
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("prompt");
  const [gpsMessage, setGpsMessage] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const initialCenteredRef = useRef(false);

  const [incoming, setIncoming] = useState<RideRow | null>(null);
  const [active, setActive] = useState<RideRow | null>(null);
  const [passenger, setPassenger] = useState<Passenger | null>(null);
  const [countdown, setCountdown] = useState(15);

  const [polyline, setPolyline] = useState<LatLng[]>([]);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [legKm, setLegKm] = useState<number | null>(null);

  // resumo do dia
  const [todayStats, setTodayStats] = useState<{ rides: number; earnings: number }>({ rides: 0, earnings: 0 });

  // pós-corrida (rating)
  const [ratingRide, setRatingRide] = useState<RideRow | null>(null);
  const [stars, setStars] = useState<number>(5);
  const [ratingComment, setRatingComment] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);

  const mapRef = useRef<google.maps.Map | null>(null);
  const sheetRef = useRef<MovviSheetHandle | null>(null);

  // Refs para evitar recriação do canal Realtime e impedir loop de oferta
  const activeRef = useRef<RideRow | null>(null);
  const incomingRef = useRef<RideRow | null>(null);
  const ratingRef = useRef<RideRow | null>(null);
  // Corridas que o motorista já tratou (aceitou/recusou) — NUNCA reabrir
  const handledRidesRef = useRef<Set<string>>(new Set());
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { incomingRef.current = incoming; }, [incoming]);
  useEffect(() => { ratingRef.current = ratingRide; }, [ratingRide]);

  useDriverBroadcast(userId, online, position);

  // sessão + aprovação + perfil
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { navigate({ to: "/motorista/login" }); return; }
      setUserId(u.user.id);
      const meta = (u.user.user_metadata ?? {}) as Record<string, unknown>;
      setDriverName(((meta.name as string) || (meta.full_name as string) || u.user.email?.split("@")[0] || "").split(" ")[0]);

      const { data } = await supabase.from("drivers")
        .select("approval_status, motivo_reprovacao").eq("user_id", u.user.id).maybeSingle();
      if (!data || data.approval_status !== "aprovado") {
        setStatusBlock(
          !data ? "Cadastro de motorista não encontrado."
          : data.approval_status === "reprovado" ? `Cadastro reprovado.${data.motivo_reprovacao ? ` Motivo: ${data.motivo_reprovacao}` : ""}`
          : data.approval_status === "bloqueado" ? "Cadastro bloqueado."
          : "Cadastro em análise.");
      }
    })();
  }, [navigate]);

  // estatísticas do dia
  const loadTodayStats = useCallback(async (uid: string) => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const { data } = await supabase.from("rides")
      .select("final_price, estimated_price")
      .eq("driver_id", uid).eq("status", "finalizada")
      .gte("completed_at", start.toISOString());
    const rides = data?.length ?? 0;
    const earnings = (data ?? []).reduce((s, r) => s + Number(r.final_price ?? r.estimated_price ?? 0), 0);
    setTodayStats({ rides, earnings });
  }, []);
  useEffect(() => { if (userId) loadTodayStats(userId); }, [userId, loadTodayStats]);

  // ===== GPS =====
  const startWatch = useCallback(() => {
    if (watchIdRef.current != null) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        if (!isBrazilCoordinate(lat, lng)) return;
        setPosition((prev) => {
          if (!prev || Math.abs(prev.lat - lat) > 0.0001 || Math.abs(prev.lng - lng) > 0.0001) {
            console.log("[MOVVI MOTORISTA] localização:", { lat, lng, accuracy: pos.coords.accuracy });
          }
          return { lat, lng };
        });
      },
      (err) => { console.warn("[MOVVI MOTORISTA] watch GPS:", err.message); },
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 },
    );
  }, []);

  const requestLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGpsStatus("unavailable");
      setGpsMessage("GPS indisponível neste dispositivo.");
      return;
    }
    setGpsStatus("loading");
    setGpsMessage(null);
    console.log("[MOVVI MOTORISTA] solicitando permissão de GPS");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        console.log("[MOVVI MOTORISTA] GPS concedido:", { lat, lng });
        if (!isBrazilCoordinate(lat, lng)) {
          setGpsStatus("error");
          setGpsMessage("Coordenada fora do Brasil. Verifique seu GPS.");
          return;
        }
        setPosition({ lat, lng });
        setGpsStatus("granted");
        setGpsMessage(null);
        // salva imediatamente no perfil do motorista
        supabase.auth.getUser().then(({ data: u }) => {
          if (!u.user) return;
          supabase.from("drivers").update({
            current_lat: lat, current_lng: lng,
            last_location_at: new Date().toISOString(),
          }).eq("user_id", u.user.id).then(({ error }) => {
            if (error) console.warn("[MOVVI MOTORISTA] erro salvando localização:", error.message);
            else console.log("[MOVVI MOTORISTA] localização salva no perfil");
          });
        });
        // centraliza mapa
        if (mapRef.current && !initialCenteredRef.current) {
          mapRef.current.panTo({ lat, lng });
          mapRef.current.setZoom(16);
          initialCenteredRef.current = true;
        }
        startWatch();
      },
      (err) => {
        console.warn("[MOVVI MOTORISTA] GPS erro:", err.code, err.message);
        if (err.code === err.PERMISSION_DENIED) {
          setGpsStatus("denied");
          setGpsMessage("Localização negada. Ative a permissão do navegador para receber corridas.");
        } else if (err.code === err.TIMEOUT) {
          setGpsStatus("timeout");
          setGpsMessage("Não conseguimos obter sua localização. Tente novamente.");
        } else {
          setGpsStatus("error");
          setGpsMessage("Erro ao obter localização. Tente novamente.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, [startWatch]);

  // Verifica permissão ao montar; se já concedida, busca imediatamente
  useEffect(() => {
    purgeForeignMapCache();
    if (!("geolocation" in navigator)) {
      setGpsStatus("unavailable");
      setGpsMessage("GPS indisponível neste dispositivo.");
      return;
    }
    const permsApi = (navigator as Navigator & { permissions?: { query: (p: { name: PermissionName }) => Promise<PermissionStatus> } }).permissions;
    if (permsApi?.query) {
      permsApi.query({ name: "geolocation" as PermissionName }).then((st) => {
        console.log("[MOVVI MOTORISTA] permissão GPS:", st.state);
        if (st.state === "granted") requestLocation();
        else if (st.state === "denied") {
          setGpsStatus("denied");
          setGpsMessage("Localização negada. Ative a permissão do navegador para receber corridas.");
        } else {
          setGpsStatus("prompt");
        }
      }).catch(() => setGpsStatus("prompt"));
    } else {
      setGpsStatus("prompt");
    }
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [requestLocation]);

  // Toggle Online/Offline — se faltar GPS, solicita antes
  const toggleOnline = useCallback(() => {
    if (!position) {
      console.log("[MOVVI MOTORISTA] tentou ficar online sem GPS, solicitando permissão");
      requestLocation();
      return;
    }
    setOnline((prev) => {
      const next = !prev;
      console.log("[MOVVI MOTORISTA] online:", next, "userId:", userId, "pos:", position);
      return next;
    });
  }, [position, userId, requestLocation]);

  // offline ao desmontar
  useEffect(() => () => { if (online && userId)
    supabase.from("drivers").update({ is_online: false }).eq("user_id", userId).then();
  }, [online, userId]);

  // realtime: ofertas + corrida ativa — canal estável (não recria a cada estado)
  useEffect(() => {
    if (!userId) return;

    const presentOffer = (r: RideRow) => {
      if (r.status !== "procurar_motorista") return;
      if (r.current_offer_driver_id !== userId) return;
      if (handledRidesRef.current.has(r.id)) {
        console.log("[MOVVI MOTORISTA] oferta ignorada (já tratada):", r.id);
        return;
      }
      if (activeRef.current || incomingRef.current || ratingRef.current) return;
      console.log("[MOVVI MOTORISTA] corrida recebida:", r.id, r.category, r.origin_name, "→", r.destination_name);
      setIncoming(r); setCountdown(15);
      if (navigator.vibrate) navigator.vibrate([280, 120, 280, 120, 280]);
    };

    const applyActive = (r: RideRow) => {
      if (r.driver_id !== userId) return;
      if (r.status === "finalizada") {
        setActive(null); setPolyline([]); setRatingRide(r); setStars(5); setRatingComment("");
        loadTodayStats(userId);
      } else if (r.status === "cancelada_passageiro" || r.status === "cancelada_motorista") {
        setActive(null); setPolyline([]);
      } else if (r.status === "motorista_a_caminho" || r.status === "motorista_chegou" || r.status === "em_viagem") {
        // se está chegando uma corrida que assumimos, fecha qualquer modal de oferta para esta corrida
        if (incomingRef.current?.id === r.id) setIncoming(null);
        handledRidesRef.current.add(r.id);
        setActive(r);
      }
    };

    console.log("[MOVVI MOTORISTA] escutando corridas: canal driver-rides-" + userId);
    const ch = supabase.channel(`driver-rides-${userId}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "rides", filter: `current_offer_driver_id=eq.${userId}` },
        (p) => presentOffer(p.new as RideRow))
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "rides", filter: `driver_id=eq.${userId}` },
        (p) => applyActive(p.new as RideRow))
      .subscribe(async (status) => {
        console.log("[MOVVI MOTORISTA] status do canal:", status);
        if (status !== "SUBSCRIBED") return;
        // recupera corrida ativa em andamento primeiro
        const ongoing = await supabase
          .from("rides").select("*")
          .eq("driver_id", userId)
          .in("status", ["motorista_a_caminho", "motorista_chegou", "em_viagem"])
          .order("created_at", { ascending: false })
          .limit(1).maybeSingle();
        if (ongoing.data) { applyActive(ongoing.data as RideRow); return; }
        // só então tenta pegar oferta pendente
        const pending = await supabase
          .from("rides").select("*")
          .eq("current_offer_driver_id", userId)
          .eq("status", "procurar_motorista")
          .order("created_at", { ascending: false })
          .limit(1).maybeSingle();
        if (pending.data) presentOffer(pending.data as RideRow);
      });
    return () => { supabase.removeChannel(ch); };
  }, [userId, loadTodayStats]);

  // carrega dados do passageiro
  useEffect(() => {
    const pid = active?.passenger_id ?? ratingRide?.passenger_id;
    if (!pid) { setPassenger(null); return; }
    supabase.from("users").select("name, phone").eq("auth_user_id", pid).maybeSingle()
      .then(({ data }) => setPassenger(data ?? { name: null, phone: null }));
  }, [active?.passenger_id, ratingRide?.passenger_id]);

  // countdown da oferta
  useEffect(() => {
    if (!incoming) return;
    if (countdown <= 0) { void handleReject(); return; }
    const t = window.setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming, countdown]);

  async function handleAccept() {
    const offer = incomingRef.current;
    if (!offer) return;
    // bloqueia imediatamente para não reabrir via realtime
    handledRidesRef.current.add(offer.id);
    setIncoming(null);
    try {
      const r = await callAccept({ data: { rideId: offer.id } });
      console.log("[MOVVI MOTORISTA] corrida aceita:", offer.id);
      setActive(r as RideRow);
      sheetRef.current?.snapTo(55);
    } catch (e) {
      console.error("[MOVVI MOTORISTA] erro ao aceitar:", e);
      // libera para tentar de novo no próximo ciclo
      handledRidesRef.current.delete(offer.id);
    }
  }
  async function handleReject() {
    const offer = incomingRef.current;
    if (!offer) return;
    // marca como tratada e fecha o card imediatamente
    handledRidesRef.current.add(offer.id);
    setIncoming(null);
    console.log("[MOVVI MOTORISTA] corrida recusada:", offer.id);
    try { await callReject({ data: { rideId: offer.id } }); }
    catch (e) { console.error("[MOVVI MOTORISTA] erro ao recusar:", e); }
  }

  // rota dinâmica
  useEffect(() => {
    if (!active || !position) { setPolyline([]); setEtaSeconds(null); setLegKm(null); return; }
    const toPickup = active.status === "motorista_a_caminho" || active.status === "motorista_chegou";
    const dest = toPickup
      ? { lat: active.origin_lat, lng: active.origin_lng }
      : active.status === "em_viagem"
        ? { lat: active.destination_lat, lng: active.destination_lng }
        : null;
    if (!dest) { setPolyline([]); return; }
    callRoute({ data: { origin: position, destination: dest } })
      .then((res) => {
        setPolyline(decodePolyline(res.encodedPolyline));
        setEtaSeconds(res.durationSeconds);
        setLegKm(res.distanceMeters / 1000);
        if (mapRef.current) {
          const b = new google.maps.LatLngBounds();
          b.extend(position); b.extend(dest);
          mapRef.current.fitBounds(b, { top: 120, bottom: window.innerHeight * 0.55, left: 60, right: 60 });
        }
      })
      .catch(() => {
        // fallback: linha reta + estimativa por haversine
        setPolyline([position, dest]);
        const km = haversineKm(position, dest);
        setLegKm(km); setEtaSeconds(Math.round((km / 35) * 3600));
      });
  }, [active?.id, active?.status, position?.lat, position?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  function recenter() {
    if (position && mapRef.current) { mapRef.current.panTo(position); mapRef.current.setZoom(16); }
  }

  async function submitRating() {
    if (!ratingRide) return;
    setSubmittingRating(true);
    try {
      await supabase.from("rides")
        .update({ passenger_rating: stars, passenger_rating_comment: ratingComment || null })
        .eq("id", ratingRide.id);
      setRatingRide(null); setRatingComment(""); setStars(5);
    } finally { setSubmittingRating(false); }
  }

  const center = position ?? BRAZIL_CENTER;
  const phase = active?.status;
  const hasRideUI = !!active || !!incoming || !!ratingRide;

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-background text-foreground">
      {/* MAPA */}
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
                path: google.maps.SymbolPath.CIRCLE, scale: 8,
                fillColor: "#3b82f6", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2,
              }} />
              <Marker position={{ lat: active.destination_lat, lng: active.destination_lng }} icon={{
                path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z",
                fillColor: "#ef4444", fillOpacity: 1, strokeColor: "#05070D",
                strokeWeight: 2, scale: 1.6, anchor: new google.maps.Point(12, 22),
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

      {/* (status de GPS é mostrado dentro do painel inferior) */}

      {/* Bloqueio aprovação */}
      {statusBlock && !hasRideUI && (
        <div className="absolute left-1/2 top-24 z-20 -translate-x-1/2 max-w-xs rounded-2xl bg-card/95 px-4 py-3 text-center shadow-2xl ring-1 ring-border backdrop-blur-md">
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

      {/* Recenter */}
      {!incoming && !ratingRide && (
        <button onClick={recenter}
          className="absolute right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-card/95 text-foreground shadow-lg ring-1 ring-border backdrop-blur hover:ring-primary/40"
          style={{ bottom: active ? "calc(58vh + 16px)" : "calc(var(--driver-panel-h, 320px) + 16px)" }}>
          <Crosshair className="h-5 w-5" />
        </button>
      )}

      {/* ===== Corrida ativa — usa bottom sheet ===== */}
      {!incoming && !ratingRide && active && (
        <MovviSheet ref={sheetRef} snaps={[32, 55, 88]} initial={55}>
          <ActiveRidePanel
            ride={active}
            passenger={passenger}
            etaSeconds={etaSeconds}
            legKm={legKm}
            onArrive={async () => { await callArrive({ data: { rideId: active.id } }); }}
            onStart={async () => { await callStart({ data: { rideId: active.id } }); }}
            onComplete={async () => {
              await callComplete({ data: {
                rideId: active.id,
                final_price: active.estimated_price ? Number(active.estimated_price) : undefined,
              } });
            }}
            onCancel={async () => { await callCancel({ data: { rideId: active.id } }); }}
          />
        </MovviSheet>
      )}

      {/* ===== Idle — painel fixo + CTA fixo (sem sheet, sem sobreposição) ===== */}
      {!incoming && !ratingRide && !active && (
        <IdleBottomPanel
          driverName={driverName}
          online={online}
          disabled={!!statusBlock}
          toggleOnline={toggleOnline}
          stats={todayStats}
          gpsStatus={gpsStatus}
          gpsMessage={gpsMessage}
          hasPosition={!!position}
          onRequestLocation={requestLocation}
        />
      )}

      {/* ===== Oferta entrante ===== */}
      {incoming && (
        <IncomingOffer
          ride={incoming}
          countdown={countdown}
          onAccept={handleAccept}
          onReject={handleReject}
        />
      )}

      {/* ===== Rating ===== */}
      {ratingRide && (
        <RatingScreen
          ride={ratingRide}
          passenger={passenger}
          stars={stars} setStars={setStars}
          comment={ratingComment} setComment={setRatingComment}
          submitting={submittingRating}
          onSubmit={submitRating}
        />
      )}

      {!hasRideUI && <BottomNav items={DRIVER_NAV} floating />}
    </div>
  );
}

/* ============================================================
   IDLE — painel fixo (sem bottom sheet)
   Sempre visível, nunca exige rolagem para mostrar o CTA.
   ============================================================ */
function IdleBottomPanel({
  driverName, online, disabled, toggleOnline, stats,
  gpsStatus, gpsMessage, hasPosition, onRequestLocation,
}: {
  driverName: string; online: boolean; disabled: boolean;
  toggleOnline: () => void; stats: { rides: number; earnings: number };
  gpsStatus: "prompt" | "loading" | "granted" | "denied" | "timeout" | "unavailable" | "error";
  gpsMessage: string | null;
  hasPosition: boolean;
  onRequestLocation: () => void;
}) {
  // Espaço reservado para a BottomNav flutuante (≈ ícones 56 + paddings + safe-area).
  const navReserve = "calc(env(safe-area-inset-bottom) + 84px)";
  const canGoOnline = hasPosition && gpsStatus === "granted";
  const showLocationCta = !hasPosition;

  return (
    <div
      className="absolute inset-x-0 z-30 rounded-t-[24px] bg-card text-foreground shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.7)] ring-1 ring-border/60"
      style={{ bottom: navReserve, ["--driver-panel-h" as never]: "auto" }}
    >
      {/* handle visual (sem arrasto, só estética) */}
      <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30" />

      <div className="flex flex-col gap-2.5 px-4 pb-3 pt-2">
        {/* linha 1: saudação + status pill compacto */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Motorista</p>
            <h1 className="truncate text-base font-bold leading-tight">{driverName || "Bem-vindo"}</h1>
          </div>
          <div
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${
              online
                ? "bg-primary/15 text-primary ring-primary/40"
                : "bg-muted/30 text-muted-foreground ring-border"
            }`}
          >
            <span className="relative flex h-2 w-2">
              {online && <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />}
              <span className={`relative h-2 w-2 rounded-full ${online ? "bg-primary" : "bg-muted-foreground"}`} />
            </span>
            {online ? "ONLINE" : "OFFLINE"}
          </div>
        </div>

        {/* linha 2: stats inline e compactas */}
        <div className="grid grid-cols-2 gap-2">
          <StatBlock label="Corridas hoje" value={stats.rides.toString()} />
          <StatBlock label="Ganhos hoje" value={formatBRL(stats.earnings)} highlight />
        </div>

        {/* CTA principal */}
        {showLocationCta ? (
          <div className="flex flex-col gap-2">
            {gpsMessage && (
              <div className={`rounded-lg px-3 py-1.5 text-[11px] ring-1 ${
                gpsStatus === "denied" || gpsStatus === "unavailable"
                  ? "bg-destructive/10 text-destructive ring-destructive/30"
                  : "bg-yellow-500/10 text-yellow-400 ring-yellow-500/30"
              }`}>
                {gpsMessage}
              </div>
            )}
            <button
              type="button"
              disabled={disabled || gpsStatus === "loading" || gpsStatus === "unavailable"}
              onClick={onRequestLocation}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold uppercase tracking-wider text-primary-foreground shadow-lg shadow-primary/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <MapPin className="h-4 w-4" />
              {gpsStatus === "loading"
                ? "Obtendo localização..."
                : gpsStatus === "denied" || gpsStatus === "timeout" || gpsStatus === "error"
                ? "Tentar novamente"
                : "Permitir localização"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={disabled || !canGoOnline}
            onClick={toggleOnline}
            className={`w-full rounded-xl py-3 text-sm font-bold uppercase tracking-wider shadow-lg transition disabled:cursor-not-allowed disabled:opacity-50 ${
              online
                ? "bg-card text-foreground ring-1 ring-border hover:ring-destructive/50"
                : "bg-primary text-primary-foreground shadow-primary/30 hover:brightness-110"
            }`}
          >
            {online ? "Ficar offline" : "Ficar online"}
          </button>
        )}
      </div>
    </div>
  );
}

function StatBlock({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl bg-background/60 px-3 py-2 ring-1 ring-border">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-base font-bold tabular-nums ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

/* ============================================================
   OFERTA ENTRANTE
   ============================================================ */
function IncomingOffer({
  ride, countdown, onAccept, onReject,
}: {
  ride: RideRow; countdown: number; onAccept: () => void; onReject: () => void;
}) {
  const pct = (countdown / 15) * 100;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm animate-in fade-in"
      role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-t-[28px] bg-card p-5 shadow-2xl ring-1 ring-primary/30 animate-in slide-in-from-bottom duration-200">
        <div className="mx-auto -mt-1 mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-widest text-primary">
              Nova corrida
            </span>
          </div>
          <CountdownRing seconds={countdown} pct={pct} />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Metric label="Distância" value={ride.distance_km ? `${Number(ride.distance_km).toFixed(1)} km` : "—"} />
          <Metric label="Tempo" value={ride.duration_min ? `${Math.round(Number(ride.duration_min))} min` : "—"} />
          <Metric label="Ganho" value={ride.estimated_price ? formatBRL(Number(ride.estimated_price)) : "—"} highlight />
        </div>

        <div className="mt-4 space-y-3 rounded-2xl bg-background/60 p-3 ring-1 ring-border">
          <RouteLine color="bg-blue-500" label="Embarque" name={ride.origin_name} />
          <div className="ml-[7px] h-3 w-px bg-border" />
          <RouteLine color="bg-destructive" label="Destino" name={ride.destination_name} />
        </div>

        <div className="mt-5 grid grid-cols-5 gap-2">
          <button onClick={onReject}
            className="col-span-2 rounded-2xl bg-muted/40 py-4 text-sm font-semibold text-muted-foreground ring-1 ring-border hover:bg-muted/60 hover:text-foreground transition">
            Recusar
          </button>
          <button onClick={onAccept}
            className="col-span-3 rounded-2xl bg-primary py-4 text-sm font-bold uppercase tracking-wider text-primary-foreground shadow-lg shadow-primary/30 hover:brightness-110 transition">
            Aceitar
          </button>
        </div>
      </div>
    </div>
  );
}

function CountdownRing({ seconds, pct }: { seconds: number; pct: number }) {
  const r = 18, c = 2 * Math.PI * r;
  return (
    <div className="relative h-12 w-12">
      <svg viewBox="0 0 44 44" className="h-12 w-12 -rotate-90">
        <circle cx="22" cy="22" r={r} stroke="hsl(var(--border))" strokeWidth="3" fill="none" />
        <circle cx="22" cy="22" r={r} stroke="#8DD92B" strokeWidth="3" fill="none"
          strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100}
          strokeLinecap="round" className="transition-[stroke-dashoffset] duration-700 ease-linear" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-sm font-bold text-primary">
        {seconds}
      </span>
    </div>
  );
}

function RouteLine({ color, label, name }: { color: string; label: string; name: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${color} ring-2 ring-card`} />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="line-clamp-2 text-sm font-medium">{name}</div>
      </div>
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl bg-background/60 px-2 py-2 ring-1 ring-border text-center">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-sm font-bold tabular-nums ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

/* ============================================================
   CORRIDA ATIVA
   ============================================================ */
function ActiveRidePanel({
  ride, passenger, etaSeconds, legKm, onArrive, onStart, onComplete, onCancel,
}: {
  ride: RideRow; passenger: Passenger | null;
  etaSeconds: number | null; legKm: number | null;
  onArrive: () => Promise<void> | void;
  onStart: () => Promise<void> | void;
  onComplete: () => Promise<void> | void;
  onCancel: () => Promise<void> | void;
}) {
  const phase = ride.status;
  const toPickup = phase === "motorista_a_caminho" || phase === "motorista_chegou";

  const header = useMemo(() => {
    if (phase === "motorista_a_caminho") return { title: "A caminho do passageiro", tone: "text-primary" };
    if (phase === "motorista_chegou")  return { title: "Aguardando passageiro",   tone: "text-yellow-400" };
    if (phase === "em_viagem")     return { title: "Em viagem",               tone: "text-primary" };
    return { title: "", tone: "" };
  }, [phase]);

  const minutes = etaSeconds != null ? Math.max(1, Math.round(etaSeconds / 60)) : null;

  return (
    <div className="flex flex-col gap-3 pt-1">
      {/* status pill */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`relative flex h-2 w-2`}>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          <span className={`text-[11px] font-bold uppercase tracking-widest ${header.tone}`}>{header.title}</span>
        </div>
        {phase === "motorista_a_caminho" && (
          <button onClick={onCancel}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted/30 hover:text-destructive">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ETA / distância */}
      {(minutes != null || legKm != null) && (
        <div className="grid grid-cols-3 gap-2">
          <Metric label="ETA" value={minutes != null ? `${minutes} min` : "—"} highlight />
          <Metric label="Distância" value={legKm != null ? `${legKm.toFixed(1)} km` : "—"} />
          <Metric label="Ganho" value={ride.estimated_price ? formatBRL(Number(ride.estimated_price)) : "—"} />
        </div>
      )}

      {/* passageiro */}
      <div className="flex items-center gap-3 rounded-2xl bg-background/60 p-3 ring-1 ring-border">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-base font-bold text-primary">
          {(passenger?.name ?? "?").trim().charAt(0).toUpperCase() || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{passenger?.name ?? "Passageiro"}</div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" /> 5.0 · {ride.payment_method === "cash" ? "Dinheiro" : (ride.payment_method ?? "—")}
          </div>
        </div>
        {passenger?.phone && (
          <a href={`tel:${passenger.phone}`}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/40 hover:bg-primary/25">
            <Phone className="h-4 w-4" />
          </a>
        )}
      </div>

      {/* endereços */}
      <div className="space-y-3 rounded-2xl bg-background/60 p-3 ring-1 ring-border">
        <div className="flex items-start gap-3">
          <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ring-2 ring-card ${
            toPickup ? "bg-blue-500 animate-pulse" : "bg-blue-500/60"}`} />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Embarque</div>
            <div className="line-clamp-2 text-sm font-medium">{ride.origin_name}</div>
          </div>
          {toPickup && (
            <a target="_blank" rel="noreferrer"
              href={`https://www.google.com/maps/dir/?api=1&destination=${ride.origin_lat},${ride.origin_lng}&travelmode=driving`}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow shadow-primary/30">
              <Navigation2 className="h-4 w-4" />
            </a>
          )}
        </div>
        <div className="ml-[7px] h-3 w-px bg-border" />
        <div className="flex items-start gap-3">
          <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ring-2 ring-card ${
            phase === "em_viagem" ? "bg-destructive animate-pulse" : "bg-destructive/60"}`} />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Destino</div>
            <div className="line-clamp-2 text-sm font-medium">{ride.destination_name}</div>
          </div>
          {phase === "em_viagem" && (
            <a target="_blank" rel="noreferrer"
              href={`https://www.google.com/maps/dir/?api=1&destination=${ride.destination_lat},${ride.destination_lng}&travelmode=driving`}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow shadow-primary/30">
              <Navigation2 className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>

      {/* CTA conforme fase */}
      {phase === "motorista_a_caminho" && (
        <ActionButton label="Cheguei ao local" onClick={onArrive} icon={MapPin} />
      )}
      {phase === "motorista_chegou" && (
        <ActionButton label="Iniciar corrida" onClick={onStart} icon={ChevronRight} />
      )}
      {phase === "em_viagem" && (
        <ActionButton label="Finalizar corrida" onClick={onComplete} icon={CheckCircle2} variant="success" />
      )}
    </div>
  );
}

function ActionButton({
  label, onClick, icon: Icon, variant = "primary",
}: {
  label: string;
  onClick: () => void | Promise<void>;
  icon: React.ComponentType<{ className?: string }>;
  variant?: "primary" | "success";
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => { setBusy(true); try { await onClick(); } finally { setBusy(false); } }}
      className={`mt-1 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold uppercase tracking-wider shadow-lg transition active:scale-[0.98] disabled:opacity-60 ${
        variant === "success"
          ? "bg-primary text-primary-foreground shadow-primary/30 hover:brightness-110"
          : "bg-primary text-primary-foreground shadow-primary/30 hover:brightness-110"}`}>
      <Icon className="h-4 w-4" />
      {busy ? "…" : label}
    </button>
  );
}

/* ============================================================
   AVALIAÇÃO + RESUMO
   ============================================================ */
function RatingScreen({
  ride, passenger, stars, setStars, comment, setComment, submitting, onSubmit,
}: {
  ride: RideRow; passenger: Passenger | null;
  stars: number; setStars: (n: number) => void;
  comment: string; setComment: (s: string) => void;
  submitting: boolean; onSubmit: () => void;
}) {
  const total = Number(ride.final_price ?? ride.estimated_price ?? 0);
  const paymentLabel = ride.payment_method === "cash" ? "Dinheiro" : (ride.payment_method ?? "—");
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md rounded-t-[28px] bg-card p-5 shadow-2xl ring-1 ring-border animate-in slide-in-from-bottom duration-200">
        <div className="mx-auto -mt-1 mb-4 h-1 w-10 rounded-full bg-muted-foreground/30" />

        {/* recebimento */}
        <div className="rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-5 ring-1 ring-primary/30 text-center">
          <div className="mx-auto mb-2 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Corrida concluída</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-primary">{formatBRL(total)}</p>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-background/70 px-3 py-1 text-[11px] font-medium ring-1 ring-border">
            <Banknote className="h-3 w-3" /> Receba em {paymentLabel.toLowerCase()}
          </div>
        </div>

        {/* resumo viagem */}
        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          <Metric label="Distância" value={ride.distance_km ? `${Number(ride.distance_km).toFixed(1)} km` : "—"} />
          <Metric label="Duração" value={ride.duration_min ? `${Math.round(Number(ride.duration_min))} min` : "—"} />
        </div>

        {/* rating */}
        <div className="mt-4">
          <div className="text-center text-sm font-semibold">
            Avalie {passenger?.name ?? "o passageiro"}
          </div>
          <div className="mt-2 flex items-center justify-center gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setStars(n)}
                className="transition active:scale-90">
                <Star className={`h-9 w-9 transition ${
                  n <= stars ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"}`} />
              </button>
            ))}
          </div>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)}
            placeholder="Comentário (opcional)"
            className="mt-3 w-full resize-none rounded-2xl bg-background/60 p-3 text-sm ring-1 ring-border focus:outline-none focus:ring-primary/50"
            rows={2} />
        </div>

        <button disabled={submitting} onClick={onSubmit}
          className="mt-4 w-full rounded-2xl bg-primary py-4 text-sm font-bold uppercase tracking-wider text-primary-foreground shadow-lg shadow-primary/30 hover:brightness-110 disabled:opacity-60">
          {submitting ? "Enviando…" : "Enviar avaliação"}
        </button>
      </div>
    </div>
  );
}
