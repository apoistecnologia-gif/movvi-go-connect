import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Marker } from "@react-google-maps/api";
import { LogOut, MapPin, Navigation2, Search } from "lucide-react";
import { MovviMap } from "@/components/MovviMap";
import { MovviLogo } from "@/components/MovviLogo";
import { supabase } from "@/integrations/supabase/client";
import { BRASILIA_CENTER } from "@/lib/googleMaps";

export const Route = createFileRoute("/passageiro/app")({
  head: () => ({ meta: [{ title: "App do Passageiro — MOVVI DRIVE" }] }),
  component: PassageiroApp,
});

function PassageiroApp() {
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        navigate({ to: "/passageiro/login" });
        return;
      }
      setUserEmail(data.user.email ?? null);
    });
  }, [navigate]);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGpsError("GPS indisponível neste dispositivo");
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsError(null);
      },
      (err) => setGpsError(err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/passageiro/login" });
  }

  const center = position ?? BRASILIA_CENTER;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Mapa em tela cheia */}
      <div className="absolute inset-0">
        <MovviMap center={center} zoom={position ? 16 : 13} height="100%">
          {position && (
            <Marker
              position={position}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: 10,
                fillColor: "#8DD92B",
                fillOpacity: 1,
                strokeColor: "#05070D",
                strokeWeight: 3,
              }}
            />
          )}
        </MovviMap>
      </div>

      {/* Top bar */}
      <header className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between gap-3 p-4">
        <Link
          to="/passageiro/app"
          className="flex items-center gap-2 rounded-full bg-card/90 px-4 py-2 backdrop-blur-md shadow-lg ring-1 ring-border"
        >
          <MovviLogo className="h-6 w-auto" />
        </Link>
        <div className="flex items-center gap-2">
          {userEmail && (
            <span className="hidden sm:inline-flex rounded-full bg-card/90 px-3 py-2 text-xs text-muted-foreground backdrop-blur-md ring-1 ring-border">
              {userEmail}
            </span>
          )}
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 rounded-full bg-card/90 px-3 py-2 text-xs font-medium text-foreground backdrop-blur-md ring-1 ring-border hover:bg-card transition"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair
          </button>
        </div>
      </header>

      {/* GPS status */}
      {gpsError && (
        <div className="absolute left-1/2 top-20 z-10 -translate-x-1/2 rounded-full bg-destructive/90 px-4 py-1.5 text-xs text-destructive-foreground shadow-lg backdrop-blur">
          GPS: {gpsError}
        </div>
      )}

      {/* Painel inferior — solicitar corrida */}
      <div className="absolute bottom-0 left-0 right-0 z-10 px-4 pb-6 pt-4">
        <div className="mx-auto max-w-xl rounded-3xl bg-card/95 p-5 shadow-2xl ring-1 ring-border backdrop-blur-xl">
          <div className="mb-4 flex items-center gap-2">
            <Navigation2 className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold tracking-tight">Para onde vamos?</h2>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-3 rounded-xl bg-background/60 px-3 py-3 ring-1 ring-border">
              <span className="flex h-2 w-2 rounded-full bg-primary shadow-[0_0_0_4px_rgba(141,217,43,0.2)]" />
              <input
                type="text"
                placeholder="Origem (sua localização atual)"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                disabled
                value={position ? "Localização atual" : "Detectando GPS..."}
              />
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </div>

            <button
              type="button"
              onClick={() => alert("Busca de endereços disponível na próxima fase.")}
              className="flex w-full items-center gap-3 rounded-xl bg-background/60 px-3 py-3 text-left ring-1 ring-border transition hover:bg-background/80"
            >
              <span className="flex h-2 w-2 rounded-full bg-destructive" />
              <span className="flex-1 text-sm text-muted-foreground">
                Insira o endereço de destino
              </span>
              <Search className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          <button
            type="button"
            disabled
            className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition disabled:opacity-60"
          >
            Solicitar MOVVI
          </button>

          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            Mapa ativo • Busca de endereços e corridas chegam na Fase 3
          </p>
        </div>
      </div>
    </div>
  );
}
