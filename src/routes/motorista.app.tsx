import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Avatar } from "@/components/Avatar";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Marker, Polyline } from "@react-google-maps/api";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Crosshair,
  LogOut,
  MapPin,
  Menu,
  MessageCircle,
  Navigation2,
  Phone,
  Star,
  Clock,
  Circle,
  Route as RouteIcon,
  X,
  ChevronRight,
} from "lucide-react";
import { RIDE_CATEGORIES } from "@/lib/rideCategories";
import { MovviMap } from "@/components/MovviMap";
import { DriverSideMenu } from "@/components/DriverSideMenu";
import { MovviSheet, type MovviSheetHandle } from "@/components/MovviSheet";
import { PassengerProfessionalProfileDialog } from "@/components/profile/PassengerProfessionalProfileDialog";
import { SafetyCard } from "@/components/safety/SafetyCard";
import {
  InterpolatedDriverMarker,
  PlacePinMarker,
} from "@/components/mapMarkers";
import { smoothPanZoom } from "@/lib/mapCamera";
import { supabase } from "@/integrations/supabase/client";
import {
  BRAZIL_CENTER,
  isBrazilCoordinate,
  purgeForeignMapCache,
  safePoint,
  safeSymbol,
} from "@/lib/googleMaps";
import { useDriverBroadcast } from "@/hooks/useDriverBroadcast";
import { loadDriverProfile, driverProfileCompletionIssues } from "@/lib/driverProfile";
import { isDevelopmentEnvironment } from "@/lib/environment";
import { computeRoute } from "@/lib/routes.functions";
import {
  aceitarCorrida,
  recusarCorrida,
  informarChegada,
  iniciarCorrida,
  finalizarCorrida,
  cancelarPeloMotorista,
  avaliarPassageiro,
  type RideStatus,
} from "@/lib/rideLifecycle";
import { notifyRideStatus } from "@/lib/rideStatusToast";
import { toast } from "sonner";

import { requestPushPermission, showPush } from "@/lib/pushNotifications";
import { formatBRL } from "@/lib/rideCategories";
import type { Database } from "@/integrations/supabase/types";

const TEST_DRIVER_LOCATION = {
  lat: -7.446,
  lng: -41.478,
};

/** Tempo máximo (em segundos) que uma oferta de corrida fica visível para
 *  o motorista antes de ser recusada automaticamente. */
const RIDE_OFFER_TIMEOUT_SECONDS = 60;

export const Route = createFileRoute("/motorista/app")({
  head: () => ({ meta: [{ title: "App do Motorista — MOVVI DRIVE" }] }),
  component: MotoristaApp,
});

type LatLng = { lat: number; lng: number };
type RideRow = Database["public"]["Tables"]["rides"]["Row"];
type Passenger = { name: string | null; phone: string | null; avatar_url: string | null };

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

type RequestRemovalReason =
  | "accepted_by_other"
  | "driver_rejected"
  | "passenger_cancelled"
  | "expired"
  | "no_longer_candidate";

const ALLOWED_REQUEST_REMOVAL_REASONS = new Set<RequestRemovalReason>([
  "accepted_by_other",
  "driver_rejected",
  "passenger_cancelled",
  "expired",
  "no_longer_candidate",
]);

function getRequestExpiresAtMs(ride: RideRow): number | null {
  const value = (ride as { request_expires_at?: string | null }).request_expires_at;
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function computeOfferCountdown(ride: RideRow): number {
  const expiresAtMs = getRequestExpiresAtMs(ride);
  if (!expiresAtMs) return RIDE_OFFER_TIMEOUT_SECONDS;
  return Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000));
}

function paymentLabelFor(method: string | null | undefined): string {
  switch (method) {
    case "dinheiro":
    case "cash":
      return "Dinheiro";
    case "pix":
      return "PIX";
    case "cartao_credito":
    case "card":
      return "Cartão de crédito";
    default:
      return method ?? "—";
  }
}

function subscriptionBlockMessage(status: string): string {
  switch (status) {
    case "overdue":
    case "pending":
      return "Sua mensalidade está pendente. Regularize para ficar online.";
    case "expired":
      return "Sua mensalidade expirou. Regularize para voltar a operar.";
    case "blocked":
    case "suspended":
      return "Acesso bloqueado. Regularize sua mensalidade para continuar.";
    case "cancelled":
      return "Assinatura cancelada. Reative seu plano para receber corridas.";
    case "inactive":
    default:
      return "Assinatura inativa. Ative seu plano para receber corridas.";
  }
}

function subscriptionBlockIsPayable(status: string): boolean {
  return ["overdue", "pending", "expired", "blocked", "suspended", "cancelled", "inactive"].includes(status);
}


function MotoristaApp() {
  const navigate = useNavigate();
  const callAccept   = useServerFn(aceitarCorrida);
  const callReject   = useServerFn(recusarCorrida);
  const callArrive   = useServerFn(informarChegada);
  const callStart    = useServerFn(iniciarCorrida);
  const callComplete = useServerFn(finalizarCorrida);
  const callCancel   = useServerFn(cancelarPeloMotorista);
  const callRate     = useServerFn(avaliarPassageiro);
  const callRoute    = useServerFn(computeRoute);

  const [userId, setUserId] = useState<string | null>(null);
  const [driverName, setDriverName] = useState<string>("");
  const [sideMenuOpen, setSideMenuOpen] = useState(false);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }
  const [position, setPosition] = useState<(LatLng & { heading?: number | null; speed?: number | null }) | null>(null);
  const [online, setOnline] = useState(false);
  const [statusBlock, setStatusBlock] = useState<string | null>(null);
  type GpsStatus = "prompt" | "loading" | "granted" | "denied" | "timeout" | "unavailable" | "error";
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("prompt");
  const [gpsMessage, setGpsMessage] = useState<string | null>(null);
  const [showTestLocationButton, setShowTestLocationButton] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const initialCenteredRef = useRef(false);

  const [incoming, setIncoming] = useState<RideRow | null>(null);
  const [active, setActive] = useState<RideRow | null>(null);
  const [passenger, setPassenger] = useState<Passenger | null>(null);
  const [countdown, setCountdown] = useState(RIDE_OFFER_TIMEOUT_SECONDS);
  const [profilePassengerId, setProfilePassengerId] = useState<string | null>(null);

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
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const ratedRidesRef = useRef<Set<string>>(new Set());

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

  const removeIncomingRequest = useCallback((ride: RideRow, removeReason: RequestRemovalReason | string) => {
    if (!ALLOWED_REQUEST_REMOVAL_REASONS.has(removeReason as RequestRemovalReason)) {
      console.error("INVALID REQUEST REMOVAL", {
        driverId: userId,
        rideId: ride.id,
        timestamp: new Date().toISOString(),
        removeReason,
      });
      return;
    }
    if (import.meta.env.DEV) console.log("[MOVVI REQUEST REMOVAL]", {
      driverId: userId,
      rideId: ride.id,
      timestamp: new Date().toISOString(),
      removeReason,
    });
    setIncoming(null);
    if (removeReason !== "expired") handledRidesRef.current.add(ride.id);
  }, [userId]);

  // Solicita permissão de notificações push uma vez ao montar.
  useEffect(() => { void requestPushPermission(); }, []);

  // Toast em cada transição de status da corrida ativa (sem reload)
  const lastNotifiedStatusRef = useRef<RideStatus | null>(null);
  useEffect(() => {
    const s = active?.status as RideStatus | undefined;
    if (!s) { lastNotifiedStatusRef.current = null; return; }
    if (lastNotifiedStatusRef.current === s) return;
    const isFirst = lastNotifiedStatusRef.current === null;
    lastNotifiedStatusRef.current = s;
    if (isFirst) return; // não toasta ao restaurar uma corrida já em andamento
    notifyRideStatus("motorista", s);
  }, [active?.status]);


  useDriverBroadcast(userId, online, position);

  // sessão + aprovação + perfil
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { navigate({ to: "/motorista/login" }); return; }
      setUserId(u.user.id);
      const meta = (u.user.user_metadata ?? {}) as Record<string, unknown>;
      setDriverName(((meta.name as string) || (meta.full_name as string) || u.user.email?.split("@")[0] || "").split(" ")[0]);

      const result = await loadDriverProfile();
      if (result.ok) {
        const d = result.profile;
        if (d.approval_status !== "aprovado") {
          setStatusBlock(
            d.approval_status === "reprovado"
              ? `Cadastro reprovado.${d.motivo_reprovacao ? ` Motivo: ${d.motivo_reprovacao}` : ""}`
              : d.approval_status === "bloqueado"
                ? "Cadastro bloqueado. Entre em contato com o suporte."
                : "Cadastro em análise.",
          );
        } else if (d.subscription_status && d.subscription_status !== "active") {
          setStatusBlock(subscriptionBlockMessage(d.subscription_status));
        } else {
          const issues = driverProfileCompletionIssues(d);
          if (!issues.complete && issues.message) {
            setStatusBlock(issues.message);
          }
        }
      } else if (result.reason === "not_found") {
        setStatusBlock("Cadastro de motorista não encontrado.");
      } else if (result.reason === "error") {
        setStatusBlock("Erro ao carregar cadastro. Tente novamente.");
      }

    })();
  }, [navigate]);

  // Realtime: reage a mudanças no próprio cadastro (admin aprova/bloqueia,
  // assinatura vira inativa, etc.) sem precisar de reload.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`driver-self-${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "drivers", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as {
            approval_status?: string;
            subscription_status?: string | null;
            motivo_reprovacao?: string | null;
          };
          if (row.approval_status && row.approval_status !== "aprovado") {
            const msg =
              row.approval_status === "reprovado"
                ? `Cadastro reprovado.${row.motivo_reprovacao ? ` Motivo: ${row.motivo_reprovacao}` : ""}`
                : row.approval_status === "bloqueado"
                  ? "Sua conta foi bloqueada pelo administrador."
                  : "Cadastro em análise.";
            setStatusBlock(msg);
            setOnline(false);
            if (userId) {
              void supabase.from("drivers").update({ is_online: false }).eq("user_id", userId);
            }
            return;
          }
          if (row.subscription_status && row.subscription_status !== "active") {
            setStatusBlock(subscriptionBlockMessage(row.subscription_status));
            // Se já há corrida em andamento, NÃO forçar offline imediatamente:
            // deixamos a corrida atual terminar. Apenas impedimos novas ofertas
            // marcando is_online=false no banco (o dispatch ignora offline).
            // Após finalizar, o statusBlock permanece e bloqueia voltar a online.
            if (activeRef.current) {
              if (userId) {
                void supabase.from("drivers").update({ is_online: false }).eq("user_id", userId);
              }
            } else {
              setOnline(false);
              if (userId) {
                void supabase.from("drivers").update({ is_online: false }).eq("user_id", userId);
              }
            }
            return;
          }
          // Voltou ao normal
          setStatusBlock(null);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

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
        const heading = Number.isFinite(pos.coords.heading as number) ? (pos.coords.heading as number) : null;
        const speed = Number.isFinite(pos.coords.speed as number) ? (pos.coords.speed as number) : null;
        setPosition((prev) => {
          if (!prev || Math.abs(prev.lat - lat) > 0.0001 || Math.abs(prev.lng - lng) > 0.0001) {
            if (import.meta.env.DEV) console.log("[MOVVI MOTORISTA] localização:", { lat, lng, heading, speed, accuracy: pos.coords.accuracy });
          }
          return { lat, lng, heading, speed };
        });
      },
      (err) => { if (import.meta.env.DEV) console.warn("[MOVVI MOTORISTA] watch GPS:", err.message); },
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 },
    );
  }, []);

  const requestLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGpsStatus("unavailable");
      setGpsMessage("GPS indisponível neste dispositivo.");
      setShowTestLocationButton(isDevelopmentEnvironment());
      return;
    }
    setGpsStatus("loading");
    setGpsMessage(null);
    if (import.meta.env.DEV) console.log("[MOVVI MOTORISTA] solicitando GPS manualmente");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        if (import.meta.env.DEV) console.log("[MOVVI MOTORISTA] GPS concedido:", { lat, lng });
        if (!isBrazilCoordinate(lat, lng)) {
          setGpsStatus("error");
          setGpsMessage("Sua localização não parece estar no Brasil. Ative o GPS real do aparelho e tente novamente.");
          setShowTestLocationButton(isDevelopmentEnvironment());
          return;
        }
        setPosition({ lat, lng });
        setGpsStatus("granted");
        setGpsMessage(null);
        setShowTestLocationButton(false);
        // salva imediatamente no perfil do motorista
        supabase.auth.getUser().then(({ data: u }) => {
          if (!u.user) return;
          supabase.from("drivers").update({
            current_lat: lat, current_lng: lng,
            last_location_at: new Date().toISOString(),
          }).eq("user_id", u.user.id).then(({ error }) => {
            if (error) { if (import.meta.env.DEV) console.warn("[MOVVI MOTORISTA] erro salvando localização:", error.message); }
            else { if (import.meta.env.DEV) console.log("[MOVVI MOTORISTA] localização salva no perfil"); }
          });
        });
        // centraliza mapa
        if (mapRef.current && !initialCenteredRef.current) {
          smoothPanZoom(mapRef.current, { lat, lng }, 16, 700);
          initialCenteredRef.current = true;
        }
        startWatch();
      },
      (err) => {
        if (import.meta.env.DEV) console.warn("[MOVVI MOTORISTA] GPS erro:", err.code, err.message);
        if (err.code === err.PERMISSION_DENIED) {
          setGpsStatus("denied");
          setGpsMessage("Localização negada. Ative a permissão do navegador para receber corridas.");
          setShowTestLocationButton(isDevelopmentEnvironment());
        } else if (err.code === err.TIMEOUT) {
          setGpsStatus("timeout");
          setGpsMessage("Não conseguimos obter sua localização. Tente novamente.");
          setShowTestLocationButton(isDevelopmentEnvironment());
        } else {
          setGpsStatus("error");
          setGpsMessage("Erro ao obter localização. Tente novamente.");
          setShowTestLocationButton(isDevelopmentEnvironment());
        }
      },
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 300000 },
    );
  }, [startWatch]);

  // Verifica permissão ao montar sem solicitar localização automaticamente.
  // A captura real do GPS deve acontecer somente no clique em FICAR ONLINE.
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
        if (import.meta.env.DEV) console.log("[MOVVI MOTORISTA] permissão GPS:", st.state);
        if (st.state === "granted") {
          setGpsStatus("granted");
          setGpsMessage(null);
        } else if (st.state === "denied") {
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
  }, []);

  // Ativa o motorista como ONLINE com uma coordenada brasileira válida.
  // Usado tanto pelo GPS real quanto pelo modo teste (preview/dev).
  const activateOnlineWithCoords = useCallback(
    (lat: number, lng: number, heading: number | null, speed: number | null, isTest: boolean) => {
      if (!isBrazilCoordinate(lat, lng)) {
        if (import.meta.env.DEV) console.warn("[MOVVI MOTORISTA] activate ignorado — coord inválida:", { lat, lng });
        return;
      }
      setPosition({ lat, lng, heading, speed });
      setGpsStatus("granted");
      setGpsMessage(isTest ? "Modo teste ativo com localização no Brasil." : null);
      setShowTestLocationButton(false);
      if (userId) {
        supabase.from("drivers").update({
          is_online: true,
          current_lat: lat, current_lng: lng,
          current_heading: heading,
          current_speed: speed,
          last_location_at: new Date().toISOString(),
        }).eq("user_id", userId).then(({ error }) => {
          if (error) { if (import.meta.env.DEV) console.warn("[MOVVI MOTORISTA] erro salvando localização:", error.message); }
          else { if (import.meta.env.DEV) console.log("[MOVVI MOTORISTA] localização salva:", { lat, lng, isTest }); }
        });
      }
      if (mapRef.current) {
        smoothPanZoom(mapRef.current, { lat, lng }, 16, 700);
        initialCenteredRef.current = true;
      }
      if (!isTest) startWatch();
      setOnline(true);
      if (import.meta.env.DEV) console.log(`[MOVVI MOTORISTA] online: true (${isTest ? "modo teste" : "GPS real"})`);
    },
    [userId, startWatch],
  );

  async function ativarLocalizacaoTesteBrasil() {
    if (!userId) return;

    const lat = TEST_DRIVER_LOCATION.lat;
    const lng = TEST_DRIVER_LOCATION.lng;

    setPosition({ lat, lng });
    setGpsStatus("granted");
    setGpsMessage("Modo teste ativo com localização no Brasil.");
    setShowTestLocationButton(false);
    setOnline(true);

    await supabase
      .from("drivers")
      .update({
        is_online: true,
        current_lat: lat,
        current_lng: lng,
        current_heading: null,
        current_speed: null,
        last_location_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (mapRef.current) {
      smoothPanZoom(mapRef.current, { lat, lng }, 16, 700);
    }
  }

  // Toggle Online/Offline.
  // IMPORTANTE: a chamada a navigator.geolocation.getCurrentPosition é feita
  // SINCRONAMENTE dentro do click handler para preservar o gesto do usuário
  // (alguns navegadores bloqueiam o prompt se houver await antes).
  const toggleOnline = useCallback(() => {
    // Se já está online → fica offline imediatamente
    if (online) {
      if (import.meta.env.DEV) console.log("[MOVVI MOTORISTA] indo offline");
      // Para o watcher de GPS para não continuar consumindo bateria nem
      // gravando posições fantasmas enquanto o motorista está offline.
      if (watchIdRef.current != null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setOnline(false);
      return;
    }
    // Offline → tentar ficar online
    if (!("geolocation" in navigator)) {
      setGpsMessage("Não foi possível obter sua localização. Ative o GPS e permita o acesso.");
      setGpsStatus("unavailable");
      setShowTestLocationButton(isDevelopmentEnvironment());
      return;
    }
    if (statusBlock) return;
    setGpsStatus("loading");
    setGpsMessage("Obtendo sua localização...");
    setShowTestLocationButton(false);
    if (import.meta.env.DEV) console.log("[MOVVI MOTORISTA] FICAR ONLINE clicado → solicitando GPS no clique");

    const onSuccess = (pos: GeolocationPosition) => {
      const rawLat = pos.coords.latitude, rawLng = pos.coords.longitude;
      if (import.meta.env.DEV) console.log("[MOVVI MOTORISTA] GPS ok:", { lat: rawLat, lng: rawLng });
      if (!isBrazilCoordinate(rawLat, rawLng)) {
        if (isDevelopmentEnvironment()) {
          if (import.meta.env.DEV) console.warn("[MOVVI MOTORISTA] GPS fora do Brasil — fallback automático para localização de teste (dev):", { lat: rawLat, lng: rawLng });
          setGpsMessage("GPS fora do Brasil detectado. Usando localização de teste no Brasil (modo dev).");
          activateOnlineWithCoords(TEST_DRIVER_LOCATION.lat, TEST_DRIVER_LOCATION.lng, null, null, true);
          return;
        }
        if (import.meta.env.DEV) console.warn("[MOVVI MOTORISTA] GPS fora do Brasil — bloqueando online:", { lat: rawLat, lng: rawLng });
        setGpsStatus("error");
        setGpsMessage("Sua localização não parece estar no Brasil. Ative o GPS real do aparelho e tente novamente.");
        setShowTestLocationButton(true);
        return;
      }
      const heading = Number.isFinite(pos.coords.heading as number) ? (pos.coords.heading as number) : null;
      const speed = Number.isFinite(pos.coords.speed as number) ? (pos.coords.speed as number) : null;
      activateOnlineWithCoords(rawLat, rawLng, heading, speed, false);
    };


    const finalFail = (err: GeolocationPositionError) => {
      if (import.meta.env.DEV) console.warn("[MOVVI MOTORISTA] GPS erro final:", err.code, err.message);
      setGpsStatus(err.code === err.PERMISSION_DENIED ? "denied" : err.code === err.TIMEOUT ? "timeout" : "error");
      setGpsMessage("Não foi possível obter sua localização. Verifique se o GPS está ativo e tente novamente.");
      setShowTestLocationButton(isDevelopmentEnvironment());
    };

    const requestFastLocation = () => {
      navigator.geolocation.getCurrentPosition(
        onSuccess,
        (err) => {
          if (import.meta.env.DEV) console.warn("[MOVVI MOTORISTA] GPS tentativa rápida falhou:", err.code, err.message);
          if (err.code === err.PERMISSION_DENIED) {
            finalFail(err);
            return;
          }
          navigator.geolocation.getCurrentPosition(
            onSuccess,
            finalFail,
            { enableHighAccuracy: true, timeout: 30000, maximumAge: 300000 },
          );
        },
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
      );
    };

    const permsApi = (navigator as Navigator & { permissions?: { query: (p: { name: PermissionName }) => Promise<PermissionStatus> } }).permissions;
    if (permsApi?.query) {
      permsApi.query({ name: "geolocation" as PermissionName })
        .then((st) => {
          if (import.meta.env.DEV) console.log("[MOVVI MOTORISTA] permissão GPS no clique:", st.state);
          if (st.state === "denied") {
            setGpsStatus("denied");
            setGpsMessage("Localização negada. Ative a permissão do navegador para receber corridas.");
            setShowTestLocationButton(isDevelopmentEnvironment());
            return;
          }
          requestFastLocation();
        })
        .catch(requestFastLocation);
    } else {
      requestFastLocation();
    }
  }, [online, statusBlock, activateOnlineWithCoords]);

  // offline ao desmontar
  useEffect(() => () => { if (online && userId)
    supabase.from("drivers").update({ is_online: false }).eq("user_id", userId).then();
  }, [online, userId]);

  // realtime: ofertas (broadcast) + corrida ativa — canal estável
  useEffect(() => {
    if (!userId) return;

    const presentOffer = (r: RideRow) => {
      const candidates: string[] = Array.isArray((r as any).candidate_driver_ids) ? (r as any).candidate_driver_ids : [];
      const rejected: string[] = Array.isArray((r as any).rejected_driver_ids) ? (r as any).rejected_driver_ids : [];
      const acceptedDriverId = (r as any).accepted_driver_id ?? r.driver_id ?? null;
      const isCandidate = candidates.includes(userId);
      const didReject = rejected.includes(userId);
      const expired = computeOfferCountdown(r) <= 0;

      if (incomingRef.current?.id === r.id) {
        if (acceptedDriverId && acceptedDriverId !== userId) {
          removeIncomingRequest(r, "accepted_by_other");
          toast.info("Corrida aceita por outro motorista");
          return;
        }
        if (r.status === "cancelada_passageiro") {
          removeIncomingRequest(r, "passenger_cancelled");
          return;
        }
        if (didReject) {
          removeIncomingRequest(r, "driver_rejected");
          return;
        }
        if (!isCandidate) {
          removeIncomingRequest(r, "no_longer_candidate");
          return;
        }
        if (expired) {
          removeIncomingRequest(r, "expired");
          return;
        }
      }

      if (r.status !== "procurar_motorista") return;
      if (acceptedDriverId || didReject || !isCandidate || expired) return;
      if (handledRidesRef.current.has(r.id)) return;
      if (activeRef.current || ratingRef.current) return;
      if (incomingRef.current && incomingRef.current.id !== r.id) return;

      if (import.meta.env.DEV) console.log("[MOVVI MOTORISTA] corrida recebida (broadcast candidatos):", r.id, {
        category: r.category,
        origin: r.origin_name,
        destination: r.destination_name,
        candidateCount: candidates.length,
        request_expires_at: (r as any).request_expires_at,
      });
      setIncoming(r);
      setCountdown(computeOfferCountdown(r));
      if (navigator.vibrate) navigator.vibrate([280, 120, 280, 120, 280]);
    };

    const applyActive = (r: RideRow) => {
      if (incomingRef.current?.id === r.id) {
        if (r.status === "cancelada_passageiro") {
          removeIncomingRequest(r, "passenger_cancelled");
          return;
        }
        const acceptedDriverId = (r as any).accepted_driver_id ?? r.driver_id ?? null;
        if (acceptedDriverId && acceptedDriverId !== userId) {
          removeIncomingRequest(r, "accepted_by_other");
          toast.info("Corrida aceita por outro motorista");
          return;
        }
      }
      if (r.driver_id !== userId && (r as any).accepted_driver_id !== userId) return;
      if (r.status === "finalizada") {
        setActive(null); setPolyline([]);
        if (ratedRidesRef.current.has(r.id)) {
          if (ratingRef.current?.id === r.id && !ratingSubmitted) setRatingRide(null);
        } else if (!r.driver_rated_at && !ratingRef.current) {
          setRatingRide(r); setStars(5); setRatingComment(""); setRatingSubmitted(false);
        } else if (r.driver_rated_at) {
          ratedRidesRef.current.add(r.id);
          if (ratingRef.current?.id === r.id && !ratingSubmitted) setRatingRide(null);
        }
        loadTodayStats(userId);
      } else if (r.status === "cancelada_passageiro" || r.status === "cancelada_motorista") {
        const wasActive = activeRef.current?.id === r.id || r.driver_id === userId || (r as any).accepted_driver_id === userId;
        if (wasActive && r.status === "cancelada_passageiro") {
          const reason = (r.cancel_reason ?? "").trim();
          toast.warning("Passageiro cancelou a corrida", {
            description: reason ? `Motivo: ${reason}` : "Você está disponível para novas ofertas.",
            duration: 7000,
          });
          if (navigator.vibrate) navigator.vibrate([220, 90, 220, 90, 220]);
          showPush({
            title: "MOVVI • Corrida cancelada",
            body: reason ? `Motivo: ${reason}` : "O passageiro cancelou a corrida.",
            tag: `movvi-ride-motorista-cancelada_passageiro-${r.id}`,
            url: "/motorista/app",
          });
        }
        handledRidesRef.current.add(r.id);
        setIncoming(null);
        setActive(null);
        setPolyline([]);
      } else if (r.status === "motorista_a_caminho" || r.status === "motorista_chegou" || r.status === "em_viagem") {
        if (incomingRef.current?.id === r.id) setIncoming(null);
        handledRidesRef.current.add(r.id);
        setActive(r);
      }
    };

    if (import.meta.env.DEV) console.log("[MOVVI MOTORISTA] escutando corridas: canal driver-rides-" + userId);
    // Sem filtro por coluna: a RLS já garante que só recebo rides em que estou
    // envolvido (passageiro/driver/candidate_driver_ids/accepted_driver_id).
    const ch = supabase.channel(`driver-rides-${userId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "rides" },
        (p) => {
          const row = (p.new ?? p.old) as RideRow;
          if (!row) return;
          presentOffer(row);
          applyActive(row);
        })
      .subscribe(async (status) => {
        if (import.meta.env.DEV) console.log("[MOVVI MOTORISTA] status do canal:", status);
        if (status !== "SUBSCRIBED") return;
        const ongoing = await supabase
          .from("rides").select("*")
          .eq("driver_id", userId)
          .in("status", ["motorista_a_caminho", "motorista_chegou", "em_viagem"])
          .order("created_at", { ascending: false })
          .limit(1).maybeSingle();
        if (ongoing.data) { applyActive(ongoing.data as RideRow); return; }
        const pending = await supabase
          .from("rides").select("*")
          .contains("candidate_driver_ids", [userId])
          .eq("status", "procurar_motorista")
          .order("created_at", { ascending: false })
          .limit(1).maybeSingle();
        if (pending.data) presentOffer(pending.data as RideRow);
      });

    // Rede de segurança 1: re-sincroniza ao retomar a aba (após background no mobile)
    const onVisibility = async () => {
      if (document.visibilityState !== "visible") return;
      if (import.meta.env.DEV) console.log("[MOVVI MOTORISTA] aba visível — ressincronizando corrida ativa");
      const ongoing = await supabase
        .from("rides").select("*").eq("driver_id", userId)
        .in("status", ["motorista_a_caminho", "motorista_chegou", "em_viagem", "finalizada"])
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (ongoing.data) { applyActive(ongoing.data as RideRow); return; }
      const pending = await supabase
        .from("rides").select("*")
        .contains("candidate_driver_ids", [userId])
        .eq("status", "procurar_motorista")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (pending.data) presentOffer(pending.data as RideRow);
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Rede de segurança 2: polling leve da corrida ativa a cada 8s caso o realtime caia
    const poll = window.setInterval(async () => {
      const cur = activeRef.current;
      if (!cur) return;
      const { data } = await supabase.from("rides").select("*").eq("id", cur.id).maybeSingle();
      if (data && (data as RideRow).status !== cur.status) {
        if (import.meta.env.DEV) console.log("[MOVVI MOTORISTA] polling detectou mudança de status:", cur.status, "→", (data as RideRow).status);
        applyActive(data as RideRow);
      }
    }, 8000);

    return () => {
      supabase.removeChannel(ch);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(poll);
    };
  }, [userId, loadTodayStats]);


  // carrega dados do passageiro
  useEffect(() => {
    const pid = active?.passenger_id ?? ratingRide?.passenger_id ?? incoming?.passenger_id;
    if (!pid) { setPassenger(null); return; }
    supabase.from("users").select("name, phone, avatar_url").eq("auth_user_id", pid).maybeSingle()
      .then(({ data }) => setPassenger(data ?? { name: null, phone: null, avatar_url: null }));
  }, [active?.passenger_id, ratingRide?.passenger_id, incoming?.passenger_id]);

  // countdown da oferta
  useEffect(() => {
    if (!incoming) return;
    if (countdown <= 0) {
      removeIncomingRequest(incoming, "expired");
      void callReject({ data: { rideId: incoming.id } }).catch((e) => console.error("[MOVVI MOTORISTA] erro ao expirar oferta:", e));
      return;
    }
    const t = window.setTimeout(() => setCountdown(computeOfferCountdown(incoming)), 1000);
    return () => window.clearTimeout(t);
  }, [incoming, countdown, callReject, removeIncomingRequest]);

  async function handleAccept() {
    const offer = incomingRef.current;
    if (!offer) return;
    try {
      const r = await callAccept({ data: { rideId: offer.id } });
      if (import.meta.env.DEV) console.log("[MOVVI MOTORISTA] corrida aceita:", offer.id);
      // Só remove o alerta depois que o backend confirma o aceite da MESMA corrida.
      handledRidesRef.current.add(offer.id);
      setIncoming(null);
      setActive(r as RideRow);
      sheetRef.current?.snapTo(50);
    } catch (e) {
      console.error("[MOVVI MOTORISTA] erro ao aceitar:", e);
      handledRidesRef.current.delete(offer.id);
      setIncoming(offer);
      setGpsMessage(e instanceof Error ? e.message : "Não foi possível aceitar a corrida. Tente novamente.");
    }
  }
  async function handleReject() {
    const offer = incomingRef.current;
    if (!offer) return;
    removeIncomingRequest(offer, "driver_rejected");
    if (import.meta.env.DEV) console.log("[MOVVI MOTORISTA] corrida recusada:", offer.id);
    try { await callReject({ data: { rideId: offer.id } }); }
    catch (e) { console.error("[MOVVI MOTORISTA] erro ao recusar:", e); }
  }

  // ===== CONTROLADOR ÚNICO DE CÂMERA =====
  // Regras:
  //  - initialCenter é congelado na primeira coord válida (evita setCenter
  //    repetido a cada render — passar `position` ao vivo no <MovviMap>
  //    causava o "pulo" vertical do mapa).
  //  - autoFollow segue o motorista suavemente com panTo throttled.
  //  - Arrastar o mapa desativa o follow até o usuário tocar em "recenter".
  //  - fitBounds só roda quando muda rideId/status (NUNCA por GPS).
  const positionRef = useRef<typeof position>(null);
  useEffect(() => { positionRef.current = position; }, [position]);

  const [initialMapCenter, setInitialMapCenter] = useState<LatLng | null>(null);
  useEffect(() => {
    if (!initialMapCenter && position && isBrazilCoordinate(position.lat, position.lng)) {
      setInitialMapCenter({ lat: position.lat, lng: position.lng });
    }
  }, [position, initialMapCenter]);
  // Centro/zoom estáveis para o <MovviMap>. Memoizados por referência para
  // que o componente <GoogleMap> não chame setCenter/setZoom a cada render.
  const stableMapCenter = useMemo(
    () => initialMapCenter ?? BRAZIL_CENTER,
    [initialMapCenter],
  );
  const stableMapZoom = useMemo(() => (initialMapCenter ? 16 : 5), [initialMapCenter]);

  const autoFollowRef = useRef(true);
  const lastFollowAtRef = useRef(0);
  const lastFitKeyRef = useRef<string | null>(null);
  const routeFailToastedRef = useRef<string | null>(null);

  // Detecta arrasto manual → desliga follow.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onDragStart = () => { autoFollowRef.current = false; };
    const listener = google.maps.event.addListener(map, "dragstart", onDragStart);
    return () => { google.maps.event.removeListener(listener); };
  }, [initialMapCenter]); // re-anexa quando o mapa fica disponível

  // Follow suave do motorista: panTo throttled (a cada 1.5s) e somente se a
  // distância for relevante (>15m). Não mexe no zoom.
  useEffect(() => {
    if (!position || !mapRef.current || !autoFollowRef.current) return;
    if (!active) return; // só segue durante corrida ativa
    const now = Date.now();
    if (now - lastFollowAtRef.current < 1500) return;
    const center = mapRef.current.getCenter();
    if (center) {
      const dKm = haversineKm({ lat: center.lat(), lng: center.lng() }, position);
      if (dKm < 0.015) return; // <15m — não vale repintar
    }
    lastFollowAtRef.current = now;
    mapRef.current.panTo(position);
  }, [position?.lat, position?.lng, active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rota — depende SOMENTE de rideId/status. Usa posição via ref para não
  // recomputar a rota nem fazer fitBounds a cada GPS.
  useEffect(() => {
    if (!active) { setPolyline([]); setEtaSeconds(null); setLegKm(null); lastFitKeyRef.current = null; return; }
    const pos = positionRef.current;
    if (!pos) return;
    const toPickup = active.status === "motorista_a_caminho" || active.status === "motorista_chegou";
    const dest = toPickup
      ? { lat: active.origin_lat, lng: active.origin_lng }
      : active.status === "em_viagem"
        ? { lat: active.destination_lat, lng: active.destination_lng }
        : null;
    if (!dest) { setPolyline([]); return; }
    const fitKey = `${active.id}-${active.status}`;
    callRoute({ data: { origin: pos, destination: dest } })
      .then((res) => {
        setPolyline(decodePolyline(res.encodedPolyline));
        setEtaSeconds(res.durationSeconds);
        setLegKm(res.distanceMeters / 1000);
        if (routeFailToastedRef.current === fitKey) routeFailToastedRef.current = null;
        // fitBounds APENAS uma vez por transição de status.
        if (mapRef.current && lastFitKeyRef.current !== fitKey) {
          lastFitKeyRef.current = fitKey;
          autoFollowRef.current = false; // evita conflito com follow
          const b = new google.maps.LatLngBounds();
          b.extend(pos); b.extend(dest);
          mapRef.current.fitBounds(b, { top: 120, bottom: window.innerHeight * 0.55, left: 60, right: 60 });
          // reativa follow depois da animação inicial
          window.setTimeout(() => { autoFollowRef.current = true; }, 1200);
        }
      })
      .catch(() => {
        // Fallback: mantém marcadores e desenha linha reta para não quebrar UX.
        setPolyline([pos, dest]);
        const km = haversineKm(pos, dest);
        setLegKm(km); setEtaSeconds(Math.round((km / 35) * 3600));
        // Aviso não-bloqueante — apenas uma vez por transição de status.
        if (routeFailToastedRef.current !== fitKey) {
          routeFailToastedRef.current = fitKey;
          toast.message("Não foi possível traçar a rota agora. Use navegação externa.");
        }
      });
  }, [active?.id, active?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  function recenter() {
    autoFollowRef.current = true;
    lastFollowAtRef.current = 0;
    const pos = positionRef.current;
    if (pos && mapRef.current) { smoothPanZoom(mapRef.current, pos, 16, 650); }
  }


  async function submitRating() {
    if (!ratingRide) return;
    if (submittingRating || ratingSubmitted) return; // garante envio único
    if (ratedRidesRef.current.has(ratingRide.id)) {
      setRatingSubmitted(true);
      return;
    }
    setSubmittingRating(true);
    setRatingError(null);
    try {
      await callRate({ data: { rideId: ratingRide.id, stars, comment: ratingComment || null } });
      ratedRidesRef.current.add(ratingRide.id);
      setRatingSubmitted(true);
    } catch (e) {
      const msg = (e as Error)?.message ?? "Falha ao enviar avaliação.";
      if (import.meta.env.DEV) console.warn("[MOVVI MOTORISTA] erro ao avaliar:", msg);
      setRatingError(msg);
    } finally { setSubmittingRating(false); }
  }

  function dismissRating() {
    setRatingRide(null);
    setRatingSubmitted(false);
    setRatingError(null);
    setRatingComment("");
    setStars(5);
  }

  function skipRating() {
    if (ratingRide) ratedRidesRef.current.add(ratingRide.id);
    dismissRating();
  }

  
  const phase = active?.status;
  const hasRideUI = !!active || !!incoming || !!ratingRide;

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-background text-foreground">
      {/* MAPA */}
      <div className="absolute inset-0">
        <MovviMap center={stableMapCenter} zoom={stableMapZoom} height="100%"
          themeOverride={active ? "light" : undefined}
          onLoad={(m) => { mapRef.current = m; }}>
          {position && (
            <InterpolatedDriverMarker
              position={position}
              heading={position.heading ?? 0}
              color={online ? "#8DD92B" : "#94a3b8"}
            />
          )}
          {active && (
            <>
              <PlacePinMarker
                position={{ lat: active.origin_lat, lng: active.origin_lng }}
                color="#8DD92B"
                zIndexBase={9990}
              />
              <PlacePinMarker
                position={{ lat: active.destination_lat, lng: active.destination_lng }}
                color="#ef4444"
                zIndexBase={9992}
              />
            </>
          )}
          {polyline.length > 0 && (
            <>
              {/* sombra difusa — profundidade sutil */}
              <Polyline path={polyline} options={{
                strokeColor: "#000000", strokeOpacity: 0.12, strokeWeight: 20, geodesic: true, zIndex: 1,
              }} />
              {/* halo branco — legibilidade em qualquer terreno */}
              <Polyline path={polyline} options={{
                strokeColor: "#ffffff", strokeOpacity: 0.95, strokeWeight: 14, geodesic: true, zIndex: 2,
              }} />
              {/* rota — verde MOVVI, encorpado */}
              <Polyline path={polyline} options={{
                strokeColor: "#8DD92B", strokeOpacity: 1, strokeWeight: 9, geodesic: true, zIndex: 3,
              }} />
            </>
          )}
        </MovviMap>
      </div>

      {/* Top bar — glass flutuante premium (60px, radius 22, backdrop blur) */}
      <div className="absolute inset-x-0 top-0 z-40 px-3 pt-[calc(env(safe-area-inset-top)+8px)] motion-safe:animate-[fadeIn_320ms_ease-out]">
        <div
          className="mx-auto flex h-[60px] max-w-5xl items-center gap-3 rounded-[22px] px-3 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.55)]"
          style={{
            background: "color-mix(in oklab, #0b0d10 62%, transparent)",
            border: "1px solid rgba(255,255,255,0.06)",
            backdropFilter: "blur(10px) saturate(140%)",
          }}
        >
          <button
            onClick={() => setSideMenuOpen(true)}
            aria-label="Abrir menu"
            className="press-scale inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground/90 transition hover:bg-white/5"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <Menu className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </button>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[11px] font-normal text-muted-foreground">
              {greetingForNow()},
            </div>
            <div className="truncate text-[15px] font-bold text-foreground">
              {driverName || "Motorista"}
            </div>
          </div>
          <button
            onClick={handleLogout}
            aria-label="Sair"
            className="press-scale inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground/80 transition hover:bg-white/5 hover:text-destructive"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <LogOut className="h-[16px] w-[16px]" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <DriverSideMenu
        open={sideMenuOpen}
        onOpenChange={setSideMenuOpen}
        onLogout={handleLogout}
      />

      {/* (status de GPS é mostrado dentro do painel inferior) */}

      {/* Bloqueio aprovação */}
      {statusBlock && !hasRideUI && (
        <div className="absolute left-1/2 top-24 z-20 -translate-x-1/2 max-w-xs rounded-2xl bg-card/95 px-4 py-3 text-center shadow-2xl ring-1 ring-border backdrop-blur-md">
          <div className="flex items-center justify-center gap-2 text-yellow-400">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Mensalidade</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{statusBlock}</p>
          <button
            onClick={() => navigate({ to: "/motorista/assinatura" })}
            className="mt-2 inline-flex items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow hover:brightness-110"
          >
            Pagar mensalidade
          </button>
        </div>
      )}

      {/* Recenter — floating GPS button (56px, glass) */}
      {!incoming && !ratingRide && (
        <button onClick={recenter}
          aria-label="Centralizar mapa"
          className="press-scale absolute right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full text-foreground shadow-[0_16px_36px_-14px_rgba(0,0,0,0.6)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          style={{
            bottom: active ? "calc(58vh + 16px)" : "calc(env(safe-area-inset-bottom) + 340px)",
            background: "color-mix(in oklab, #111418 70%, transparent)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(10px) saturate(140%)",
          }}>
          <Crosshair className="h-[20px] w-[20px]" strokeWidth={1.75} />
        </button>
      )}

      {/* ===== Corrida ativa — usa bottom sheet ===== */}
      {!incoming && !ratingRide && active && (
        <MovviSheet ref={sheetRef} snaps={[26, 50, 90]} initial={50}>
          <ActiveRidePanel
            ride={active}
            passenger={passenger}
            etaSeconds={etaSeconds}
            legKm={legKm}
            onOpenProfile={() => active.passenger_id && setProfilePassengerId(active.passenger_id)}
            onArrive={async () => { await callArrive({ data: { rideId: active.id } }); }}
            onStart={async (code) => { await callStart({ data: { rideId: active.id, safety_code: code } }); }}
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

      {/* ===== Idle — painel fixo compacto (~28vh) com botão ONLINE/OFFLINE sempre visível ===== */}
      {!incoming && !ratingRide && !active && (
        <IdleBottomPanel
          driverName={driverName}
          online={online}
          disabled={!!statusBlock || gpsStatus === "loading"}
          toggleOnline={toggleOnline}
          stats={todayStats}
          gpsMessage={gpsMessage}
          loading={gpsStatus === "loading"}
          canUseTestLocation={
            !online &&
            isDevelopmentEnvironment() &&
            showTestLocationButton &&
            (gpsStatus === "error" || gpsStatus === "denied" || gpsStatus === "timeout" || gpsStatus === "unavailable")
          }
          onUseTestLocation={ativarLocalizacaoTesteBrasil}
        />
      )}

      {/* ===== Oferta entrante ===== */}
      {incoming && (
        <IncomingOffer
          ride={incoming}
          passenger={passenger}
          countdown={countdown}
          driverPos={position}
          onAccept={handleAccept}
          onReject={handleReject}
          onOpenProfile={() => incoming.passenger_id && setProfilePassengerId(incoming.passenger_id)}
        />

      )}

      {/* Perfil profissional do passageiro (modal público de confiança) */}
      <PassengerProfessionalProfileDialog
        open={profilePassengerId !== null}
        onOpenChange={(v) => { if (!v) setProfilePassengerId(null); }}
        passengerUserId={profilePassengerId}
      />


      {/* ===== Rating ===== */}
      {ratingRide && (
        <RatingScreen
          ride={ratingRide}
          passenger={passenger}
          stars={stars} setStars={setStars}
          comment={ratingComment} setComment={setRatingComment}
          submitting={submittingRating}
          submitted={ratingSubmitted}
          errorMessage={ratingError}
          onSubmit={submitRating}
          onDismiss={dismissRating}
          onSkip={skipRating}
        />
      )}

      {/* Bottom nav removido — todas as opções vivem dentro do menu lateral (hambúrguer). */}
    </div>
  );
}

/* ============================================================
   IDLE — painel fixo (sem bottom sheet)
   Sempre visível, nunca exige rolagem para mostrar o CTA.
   ============================================================ */
function greetingForNow(): string {
  const h = new Date().getHours();
  if (h < 5) return "Boa madrugada";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function IdleBottomPanel({
  driverName: _driverName, online, disabled, toggleOnline, stats, gpsMessage, loading,
  canUseTestLocation, onUseTestLocation,
}: {
  driverName: string; online: boolean; disabled: boolean;
  toggleOnline: () => void; stats: { rides: number; earnings: number };
  gpsMessage: string | null;
  loading: boolean;
  canUseTestLocation: boolean;
  onUseTestLocation: () => void;
}) {
  const navReserve = "calc(env(safe-area-inset-bottom) + 84px)";

  return (
    <div
      className="absolute inset-x-0 z-30 rounded-t-[28px] text-foreground shadow-[0_-24px_60px_-28px_rgba(0,0,0,0.7)] animate-sheet-in"
      style={{
        bottom: navReserve,
        background: "#111418",
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="mx-auto mt-2.5 h-[4px] w-10 rounded-full bg-white/10" />

      <div className="flex flex-col gap-4 px-6 pb-5 pt-3">
        {/* Status badge (capsule) */}
        <div className="flex items-center justify-between">
          <div
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
              online
                ? "bg-primary/12 text-primary"
                : "bg-white/5 text-muted-foreground"
            }`}
            style={{ border: online ? "1px solid color-mix(in oklab, var(--color-primary) 30%, transparent)" : "1px solid rgba(255,255,255,0.06)" }}
          >
            <span className="relative flex h-2 w-2">
              {online && <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />}
              <span className={`relative h-2 w-2 rounded-full ${online ? "bg-primary" : "bg-muted-foreground/60"}`} />
            </span>
            {online ? "ONLINE" : "OFFLINE"}
          </div>
          <span className="text-[13px] font-medium text-muted-foreground">
            {online ? "Recebendo solicitações" : "Toque para ativar"}
          </span>
        </div>

        {/* Stat card premium */}
        <div className="grid grid-cols-1 gap-3">
          <StatMini label="Corridas hoje" value={stats.rides.toString()} />
        </div>

        {/* GPS error */}
        {gpsMessage && (
          <div
            className="rounded-xl px-3 py-2 text-[12px] text-destructive"
            style={{ background: "color-mix(in oklab, var(--color-destructive) 12%, transparent)", border: "1px solid color-mix(in oklab, var(--color-destructive) 22%, transparent)" }}
          >
            {gpsMessage}
          </div>
        )}

        {canUseTestLocation && (
          <button
            type="button"
            onClick={onUseTestLocation}
            className="press-scale w-full rounded-xl px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary transition hover:bg-primary/15"
            style={{ background: "color-mix(in oklab, var(--color-primary) 8%, transparent)", border: "1px dashed color-mix(in oklab, var(--color-primary) 45%, transparent)" }}
          >
            Usar localização de teste no Brasil
          </button>
        )}

        {/* Primary CTA — 56px, radius 18, 1px border */}
        <button
          type="button"
          disabled={disabled}
          onClick={toggleOnline}
          className={`press-scale w-full h-14 rounded-[18px] text-[15px] font-semibold tracking-[0.01em] transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 ${
            online
              ? "text-foreground hover:bg-white/[0.04]"
              : "bg-primary text-primary-foreground shadow-[0_14px_36px_-16px_color-mix(in_oklab,var(--color-primary)_70%,transparent)] hover:brightness-105"
          }`}
          style={
            online
              ? { background: "#0e1114", border: "1px solid rgba(255,255,255,0.08)" }
              : { border: "1px solid color-mix(in oklab, var(--color-primary) 40%, transparent)" }
          }
        >
          {loading ? "Obtendo localização..." : online ? "Ficar offline" : "Ficar online"}
        </button>
      </div>
    </div>
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-center justify-between rounded-2xl px-4 py-3"
      style={{ background: "#0e1114", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <span className="text-[13px] font-normal text-muted-foreground">{label}</span>
      <span className="tabular-nums text-[24px] font-bold leading-none text-foreground">
        {value}
      </span>
    </div>
  );
}


/* ============================================================
   OFERTA ENTRANTE
   ============================================================ */
function IncomingOffer({
  ride, passenger, countdown, driverPos, onAccept, onReject, onOpenProfile,
}: {
  ride: RideRow; passenger: Passenger | null; countdown: number;
  driverPos: LatLng | null;
  onAccept: () => void; onReject: () => void; onOpenProfile?: () => void;
}) {
  const pct = (countdown / RIDE_OFFER_TIMEOUT_SECONDS) * 100;

  // Distância motorista → embarque (haversine local; sem chamadas de rede).
  const pickupKm = useMemo(() => {
    if (!driverPos || ride.origin_lat == null || ride.origin_lng == null) return null;
    return haversineKm(driverPos, { lat: ride.origin_lat, lng: ride.origin_lng });
  }, [driverPos, ride.origin_lat, ride.origin_lng]);
  const pickupMin = pickupKm != null ? Math.max(1, Math.round((pickupKm / 32) * 60)) : null;

  const cat = RIDE_CATEGORIES.find((c) => c.key === ride.category);
  const CatIcon = cat?.icon ?? RouteIcon;
  const catLabel = cat?.label?.toUpperCase() ?? "CORRIDA";

  // MOVVI Ride Score — badge visual (deriva de distance_km, sem backend novo).
  const score = useMemo(() => {
    const km = Number(ride.distance_km ?? 0);
    const pk = pickupKm ?? 0;
    if (pk >= 4) return { label: "Embarque distante", tone: "text-sky-400", dot: "bg-sky-400", bg: "bg-sky-400/10", border: "border-sky-400/25" };
    if (km >= 10) return { label: "Corrida excelente", tone: "text-primary", dot: "bg-primary", bg: "bg-primary/12", border: "border-primary/30" };
    if (km >= 5)  return { label: "Ótima corrida",     tone: "text-primary", dot: "bg-primary", bg: "bg-primary/10", border: "border-primary/25" };
    if (km > 0)   return { label: "Boa corrida",        tone: "text-amber-400", dot: "bg-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/25" };
    return { label: "Corrida disponível", tone: "text-primary", dot: "bg-primary", bg: "bg-primary/10", border: "border-primary/25" };
  }, [ride.distance_km, pickupKm]);

  const rating = (passenger as { rating?: number | null } | null)?.rating;
  const ratingText = rating != null ? Number(rating).toFixed(2) : "5.00";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-in fade-in duration-200"
      role="dialog" aria-modal="true"
    >
      <div
        className="relative w-full max-w-md rounded-t-[28px] px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4 shadow-[0_-20px_60px_-24px_rgba(0,0,0,0.55)] animate-in fade-in slide-in-from-bottom-6 zoom-in-95 duration-[260ms] ease-out"
        style={{
          maxHeight: "45vh",
          background: "#111418",
          border: "1px solid rgba(255,255,255,0.06)",
          overflow: "auto",
        }}
      >
        {/* Countdown top-right */}
        <div className="absolute right-4 top-3">
          <CountdownRing seconds={countdown} pct={pct} />
        </div>

        {/* Score badge top-left */}
        <div className={`inline-flex items-center gap-1.5 rounded-full border ${score.border} ${score.bg} px-3 py-1 text-[11px] font-semibold ${score.tone}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${score.dot}`} />
          {score.label}
        </div>

        {/* Preço hero */}
        <div className="mt-3 flex flex-col items-center">
          <div className="text-[32px] font-extrabold leading-none tracking-tight text-foreground tabular-nums">
            {ride.estimated_price != null ? formatBRL(Number(ride.estimated_price)) : "—"}
          </div>
          <div className="mt-1 text-[12px] font-medium text-muted-foreground">
            Ganho da corrida
          </div>
        </div>

        {/* Quatro cards compactos */}
        <div className="mt-4 grid grid-cols-4 gap-2">
          <InfoCard icon={<Clock className="h-[14px] w-[14px]" strokeWidth={1.75} />} value={pickupMin != null ? `${pickupMin} min` : "—"} label="ETA" />
          <InfoCard icon={<MapPin className="h-[14px] w-[14px]" strokeWidth={1.75} />} value={pickupKm != null ? `${pickupKm.toFixed(1)} km` : "—"} label="Embarque" />
          <InfoCard icon={<CatIcon className="h-[14px] w-[14px]" strokeWidth={1.75} />} value={catLabel} label="Categoria" compactValue />
          <InfoCard icon={<Star className="h-[14px] w-[14px] fill-amber-400 text-amber-400" strokeWidth={0} />} value={ratingText} label="Passageiro" />
        </div>

        {/* Passageiro — nome + rating */}
        <button
          type="button"
          onClick={onOpenProfile}
          className="press-scale mt-3 flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-white/[0.03]"
          style={{ background: "#0e1114", border: "1px solid rgba(255,255,255,0.06)" }}
          aria-label="Ver perfil do passageiro"
        >
          <Avatar
            src={passenger?.avatar_url ?? (ride as { passenger_photo_url?: string | null }).passenger_photo_url ?? null}
            name={passenger?.name ?? "Passageiro"}
            size={36}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold text-foreground">
              {passenger?.name ?? "Passageiro"}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[13px] text-muted-foreground">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" strokeWidth={0} />
              <span className="tabular-nums">{ratingText}</span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
        </button>

        {/* Endereços */}
        <div
          className="mt-3 rounded-2xl px-4 py-3.5"
          style={{ background: "#0e1114", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <AddressRow dotColor="bg-primary" label="Embarque" name={ride.pickup_label || ride.origin_name} />
          <div className="my-2.5 ml-[5px] h-px w-full bg-white/[0.06]" />
          <AddressRow dotColor="bg-destructive" label="Destino" name={ride.destination_name} />
        </div>

        {/* Botões */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onReject}
            className="press-scale h-14 rounded-[18px] text-[15px] font-semibold text-muted-foreground transition duration-[250ms] hover:text-foreground"
            style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.10)" }}
          >
            Recusar
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="press-scale h-14 rounded-[18px] bg-primary text-[15px] font-bold text-primary-foreground shadow-[0_14px_36px_-16px_color-mix(in_oklab,var(--color-primary)_70%,transparent)] transition duration-[250ms] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2"
          >
            Aceitar corrida
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoCard({
  icon, value, label, compactValue,
}: { icon: React.ReactNode; value: string; label: string; compactValue?: boolean }) {
  return (
    <div
      className="flex flex-col items-center gap-1 rounded-2xl px-1.5 py-2.5"
      style={{ background: "#0e1114", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex h-6 w-6 items-center justify-center rounded-full text-primary" style={{ background: "color-mix(in oklab, var(--color-primary) 12%, transparent)" }}>
        {icon}
      </div>
      <div className={`font-bold tabular-nums text-foreground leading-none ${compactValue ? "text-[11px] tracking-wide" : "text-[14px]"}`}>
        {value}
      </div>
      <div className="text-[10px] font-medium text-muted-foreground text-center leading-tight">
        {label}
      </div>
    </div>
  );
}

function AddressRow({
  dotColor, label, name,
}: { dotColor: string; label: string; name: string | null | undefined }) {
  const display = (name && name.trim()) || "Endereço não identificado";
  return (
    <div className="flex items-start gap-3">
      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dotColor}`} />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-normal text-muted-foreground">{label}</div>
        <div className="mt-0.5 line-clamp-1 text-[15px] font-semibold text-foreground">{display}</div>
      </div>
    </div>
  );
}

function CountdownRing({ seconds, pct }: { seconds: number; pct: number }) {
  const r = 18, c = 2 * Math.PI * r;
  const isLow = seconds <= 5;
  return (
    <div className={`relative h-12 w-12 ${isLow ? "animate-pulse-soft" : ""}`}>
      <svg viewBox="0 0 44 44" className="h-12 w-12 -rotate-90">
        <circle cx="22" cy="22" r={r} stroke="hsl(var(--border))" strokeWidth="3" fill="none" />
        <circle cx="22" cy="22" r={r} stroke="#76C139" strokeWidth="3" fill="none"
          strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100}
          strokeLinecap="round" className="transition-[stroke-dashoffset] duration-700 ease-linear" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[13px] font-bold text-primary tabular-nums">
        {seconds}
      </span>
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl px-2.5 py-2 ring-1 text-center transition ${
      highlight ? "bg-primary/10 ring-primary/25" : "bg-background/55 ring-border/60"
    }`}>
      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className={`mt-1 text-[14px] font-bold tabular-nums leading-none ${highlight ? "text-primary" : "text-foreground"}`}>{value}</div>
    </div>
  );
}

/* ============================================================
   CORRIDA ATIVA
   ============================================================ */
function ActiveRidePanel({
  ride, passenger, etaSeconds, legKm, onArrive, onStart, onComplete, onCancel, onOpenProfile,
}: {
  ride: RideRow; passenger: Passenger | null;
  etaSeconds: number | null; legKm: number | null;
  onArrive: () => Promise<void> | void;
  onStart: (code: string) => Promise<void> | void;
  onComplete: () => Promise<void> | void;
  onCancel: () => Promise<void> | void;
  onOpenProfile?: () => void;
}) {
  const [pinOpen, setPinOpen] = useState(false);
  const [pinCode, setPinCode] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);

  async function submitPin() {
    if (pinBusy) return;
    if (!/^\d{4}$/.test(pinCode)) {
      setPinError("Digite os 4 dígitos do código.");
      return;
    }
    setPinBusy(true);
    setPinError(null);
    try {
      await onStart(pinCode);
      setPinOpen(false);
      setPinCode("");
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      setPinError(
        /[Cc]ódigo incorreto/.test(msg)
          ? "Código incorreto. Peça o código ao passageiro e tente novamente."
          : msg || "Não foi possível iniciar a corrida.",
      );
    } finally {
      setPinBusy(false);
    }
  }
  const phase = ride.status;
  const toPickup = phase === "motorista_a_caminho" || phase === "motorista_chegou";

  const header = useMemo(() => {
    if (phase === "motorista_a_caminho") return { title: "A caminho do passageiro", tone: "text-primary", dot: "bg-primary" };
    if (phase === "motorista_chegou")  return { title: "Aguardando passageiro",   tone: "text-[color:var(--color-status-arrived)]", dot: "bg-[color:var(--color-status-arrived)]" };
    if (phase === "em_viagem")     return { title: "Em viagem",               tone: "text-primary", dot: "bg-primary" };
    return { title: "", tone: "", dot: "bg-primary" };
  }, [phase]);

  const minutes = etaSeconds != null ? Math.max(1, Math.round(etaSeconds / 60)) : null;

  return (
    <div className="flex flex-col gap-3 pt-1">
      {/* status pill */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`relative flex h-2 w-2`}>
            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 ${header.dot}`} />
            <span className={`relative inline-flex h-2 w-2 rounded-full ${header.dot}`} />
          </span>
          <span className={`text-[11px] font-bold uppercase tracking-widest ${header.tone}`}>{header.title}</span>
        </div>
        {phase === "motorista_a_caminho" && (
          <button onClick={onCancel} aria-label="Cancelar corrida"
            className="rounded-full p-2 min-h-11 min-w-11 flex items-center justify-center text-muted-foreground hover:bg-muted/30 hover:text-destructive transition">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ETA / distância — sem informação financeira durante a corrida */}
      {(minutes != null || legKm != null) && (
        <div className="grid grid-cols-2 gap-2">
          <Metric label="ETA" value={minutes != null ? `${minutes} min` : "—"} highlight />
          <Metric label="Distância" value={legKm != null ? `${legKm.toFixed(1)} km` : "—"} />
        </div>
      )}

      {/* passageiro — tap para abrir perfil profissional */}
      <div className="flex items-center gap-2 rounded-2xl bg-background/55 p-2 ring-1 ring-border/60">
        <button
          type="button"
          onClick={onOpenProfile}
          className="flex min-w-0 flex-1 items-center gap-3.5 rounded-xl p-1.5 text-left transition active:scale-[0.99] hover:bg-background/70"
          aria-label="Ver perfil do passageiro"
        >
          <div className="shrink-0 rounded-full ring-2 ring-white/85 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.5)]">
            <Avatar src={passenger?.avatar_url ?? (ride as { passenger_photo_url?: string | null }).passenger_photo_url ?? null} name={passenger?.name ?? "?"} size={56} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold tracking-tight">{passenger?.name ?? "Passageiro"}</div>
            <div className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" /> 5.0
              <span className="text-muted-foreground/50">·</span>
              {paymentLabelFor(ride.payment_method)}
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" />
        </button>
        {passenger?.phone && (
          <a href={`tel:${passenger.phone}`}
            className="active-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary ring-1 ring-primary/30 hover:bg-primary/20">
            <Phone className="h-[17px] w-[17px]" />
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
            <div className="line-clamp-2 text-sm font-medium">{ride.pickup_short_label || ride.pickup_label || ride.origin_name || "Endereço não identificado"}</div>
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
            <div className="line-clamp-2 text-sm font-medium">{ride.destination_name || "Endereço não identificado"}</div>
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

      {/* Safety card — SOS, share, incident */}
      <SafetyCard
        role="driver"
        rideId={ride.id}
        counterpartLabel={`Passageiro ${passenger?.name ?? ""}`.trim()}
        shareInput={{
          role: "driver",
          status: ride.status,
          passengerName: passenger?.name ?? null,
          originName: ride.pickup_label ?? ride.origin_name ?? null,
          destinationName: ride.destination_name,
        }}
      />

      {/* CTA conforme fase — transições suaves entre estados */}
      <div key={phase} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        {phase === "motorista_a_caminho" && (
          <ActionButton label="Cheguei ao local" onClick={onArrive} icon={MapPin} emphasize />
        )}
        {phase === "motorista_chegou" && (
          <ActionButton label="Iniciar corrida" onClick={() => { setPinError(null); setPinCode(""); setPinOpen(true); }} icon={ChevronRight} emphasize />
        )}
        {phase === "em_viagem" && (
          <ActionButton label="Finalizar corrida" onClick={onComplete} icon={CheckCircle2} variant="success" />
        )}
      </div>

      {/* Modal de validação do PIN de segurança */}
      {pinOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-t-[28px] sm:rounded-[28px] bg-card p-5 pb-6 shadow-premium ring-1 ring-border animate-sheet-in">
            <div className="mx-auto -mt-1 mb-4 h-1.5 w-11 rounded-full bg-muted-foreground/30 sm:hidden" />
            <div className="text-center">
              <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/30">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold">Código de segurança</h3>
              <p className="mt-1 text-[12.5px] text-muted-foreground">
                Digite o código de 4 dígitos informado pelo passageiro para iniciar a viagem.
              </p>
            </div>

            <input
              autoFocus
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={pinCode}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                setPinCode(v);
                setPinError(null);
              }}
              onKeyDown={(e) => { if (e.key === "Enter") submitPin(); }}
              placeholder="••••"
              className="mt-5 w-full rounded-2xl bg-background/70 px-4 py-4 text-center text-3xl font-extrabold tracking-[0.7em] tabular-nums ring-1 ring-border outline-none focus:ring-2 focus:ring-primary"
            />

            {pinError && (
              <div className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-[12.5px] font-medium text-destructive-foreground ring-1 ring-destructive/30">
                {pinError}
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                onClick={() => { if (!pinBusy) { setPinOpen(false); setPinCode(""); setPinError(null); } }}
                disabled={pinBusy}
                className="rounded-2xl bg-muted/40 py-3 text-[13px] font-semibold text-foreground ring-1 ring-border transition active:scale-[0.98] disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={submitPin}
                disabled={pinBusy || pinCode.length !== 4}
                className="rounded-2xl bg-primary py-3 text-[13px] font-bold uppercase tracking-wider text-primary-foreground shadow-lg shadow-primary/30 transition active:scale-[0.98] hover:brightness-110 disabled:opacity-60"
              >
                {pinBusy ? "Validando…" : "Iniciar viagem"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  label, onClick, icon: Icon, variant = "primary", emphasize = false,
}: {
  label: string;
  onClick: () => void | Promise<void>;
  icon: React.ComponentType<{ className?: string }>;
  variant?: "primary" | "success";
  emphasize?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => { setBusy(true); try { await onClick(); } finally { setBusy(false); } }}
      className={`press-scale relative mt-1 flex w-full items-center justify-center gap-2 rounded-2xl min-h-14 py-4 text-[14px] font-bold uppercase tracking-[0.15em] transition disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-card ${
        variant === "success"
          ? "bg-primary text-primary-foreground shadow-[0_14px_32px_-14px_color-mix(in_oklab,var(--color-primary)_60%,transparent)] hover:brightness-105"
          : "bg-primary text-primary-foreground shadow-[0_14px_32px_-14px_color-mix(in_oklab,var(--color-primary)_60%,transparent)] hover:brightness-105"} ${
        emphasize ? "ring-2 ring-primary/40 ring-offset-2 ring-offset-card" : ""}`}>
      {emphasize && (
        <span className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-primary/50 animate-ping opacity-40" />
      )}
      <Icon className="h-[17px] w-[17px]" />
      {busy ? "…" : label}
    </button>
  );
}

/* ============================================================
   AVALIAÇÃO + RESUMO
   ============================================================ */
function RatingScreen({
  ride, passenger, stars, setStars, comment, setComment, submitting, submitted,
  errorMessage, onSubmit, onDismiss, onSkip,
}: {
  ride: RideRow; passenger: Passenger | null;
  stars: number; setStars: (n: number) => void;
  comment: string; setComment: (s: string) => void;
  submitting: boolean; submitted: boolean;
  errorMessage: string | null;
  onSubmit: () => void; onDismiss: () => void; onSkip: () => void;
}) {
  const total = Number(ride.final_price ?? ride.estimated_price ?? 0);
  const paymentLabel = paymentLabelFor(ride.payment_method);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md rounded-t-[28px] bg-card p-5 pb-6 shadow-premium ring-1 ring-border animate-sheet-in">
        <div className="mx-auto -mt-1 mb-4 h-1.5 w-11 rounded-full bg-muted-foreground/30" />

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

        {submitted ? (
          <div className="mt-4 rounded-2xl bg-primary/10 p-5 text-center ring-1 ring-primary/30 animate-in fade-in zoom-in-95 duration-200">
            <div className="mx-auto mb-2 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <p className="text-base font-bold text-foreground">Avaliação registrada</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Você deu {stars} {stars === 1 ? "estrela" : "estrelas"} para {passenger?.name ?? "o passageiro"}. Obrigado!
            </p>
            <button onClick={onDismiss}
              className="mt-4 w-full rounded-2xl bg-primary py-4 text-sm font-bold uppercase tracking-wider text-primary-foreground shadow-lg shadow-primary/30 hover:brightness-110">
              Concluir
            </button>
          </div>
        ) : (
          <>
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


            {errorMessage && (
              <div className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive ring-1 ring-destructive/30">
                {errorMessage} Toque em <strong>Tentar novamente</strong> ou pule esta avaliação.
              </div>
            )}

            <button disabled={submitting} onClick={onSubmit}
              className="mt-4 w-full rounded-2xl bg-primary py-4 text-sm font-bold uppercase tracking-wider text-primary-foreground shadow-lg shadow-primary/30 hover:brightness-110 disabled:opacity-60">
              {submitting ? "Enviando…" : (errorMessage ? "Tentar novamente" : "Enviar avaliação")}
            </button>
            <button type="button" onClick={onSkip} disabled={submitting}
              className="mt-2 w-full rounded-2xl bg-transparent py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground disabled:opacity-60">
              Pular avaliação
            </button>
          </>
        )}
      </div>
    </div>
  );
}
