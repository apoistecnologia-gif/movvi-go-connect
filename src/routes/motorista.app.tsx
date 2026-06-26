import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Marker } from "@react-google-maps/api";
import { Power, AlertTriangle } from "lucide-react";
import { MovviMap } from "@/components/MovviMap";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, DRIVER_NAV } from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";
import { BRASILIA_CENTER } from "@/lib/googleMaps";

export const Route = createFileRoute("/motorista/app")({
  head: () => ({ meta: [{ title: "App do Motorista — MOVVI DRIVE" }] }),
  component: MotoristaApp,
});

type LatLng = { lat: number; lng: number };

function MotoristaApp() {
  const navigate = useNavigate();
  const [position, setPosition] = useState<LatLng | null>(null);
  const [online, setOnline] = useState(false);
  const [statusBlock, setStatusBlock] = useState<string | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  // Valida sessão e aprovação
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        navigate({ to: "/motorista/login" });
        return;
      }
      const { data } = await supabase
        .from("drivers")
        .select("approval_status")
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (!data || data.approval_status !== "approved") {
        setStatusBlock(
          data?.approval_status === "rejected"
            ? "Seu cadastro foi recusado."
            : data?.approval_status === "blocked"
            ? "Sua conta está bloqueada."
            : "Seu cadastro está em análise.",
        );
      }
    })();
  }, [navigate]);

  // GPS
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGpsError("GPS indisponível neste dispositivo");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsError(null);
      },
      (err) => setGpsError(err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const center = position ?? BRASILIA_CENTER;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0">
        <MovviMap
          center={center}
          zoom={position ? 16 : 13}
          height="100%"
          onLoad={(m) => { mapRef.current = m; }}
        >
          {position && (
            <Marker
              position={position}
              icon={{
                path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                scale: 6,
                fillColor: online ? "#8DD92B" : "#94a3b8",
                fillOpacity: 1,
                strokeColor: "#05070D",
                strokeWeight: 2,
              }}
            />
          )}
        </MovviMap>
      </div>

      <MovviHeader variant="floating" logoutRedirect="/" />

      {gpsError && (
        <div className="absolute left-1/2 top-24 z-20 -translate-x-1/2 rounded-full bg-destructive/90 px-4 py-1.5 text-xs text-destructive-foreground shadow-lg backdrop-blur">
          GPS: {gpsError}
        </div>
      )}

      {/* Aviso se não aprovado */}
      {statusBlock && (
        <div className="absolute left-1/2 top-24 z-20 -translate-x-1/2 max-w-xs rounded-xl bg-card/95 px-4 py-3 text-center shadow-2xl ring-1 ring-border backdrop-blur-md">
          <div className="flex items-center justify-center gap-2 text-yellow-400">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Aguardando aprovação
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{statusBlock}</p>
          <button
            onClick={() => navigate({ to: "/motorista/status" })}
            className="mt-2 text-xs font-medium text-primary hover:underline"
          >
            Ver status do cadastro →
          </button>
        </div>
      )}

      {/* Botão ONLINE flutuante */}
      <div className="absolute bottom-28 left-1/2 z-20 -translate-x-1/2">
        <button
          type="button"
          disabled={!!statusBlock}
          onClick={() => setOnline((v) => !v)}
          className={`group flex h-20 w-20 items-center justify-center rounded-full shadow-2xl ring-4 transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
            online
              ? "bg-primary text-primary-foreground ring-primary/30 hover:brightness-110"
              : "bg-card text-foreground ring-border hover:ring-primary/40"
          }`}
          aria-label={online ? "Ficar offline" : "Ficar online"}
        >
          <Power className="h-7 w-7" />
        </button>
        <div className="mt-2 text-center text-xs font-semibold uppercase tracking-wider">
          {online ? (
            <span className="text-primary">Online</span>
          ) : (
            <span className="text-muted-foreground">Offline</span>
          )}
        </div>
      </div>

      <BottomNav items={DRIVER_NAV} floating />
    </div>
  );
}
