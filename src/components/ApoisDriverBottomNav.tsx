import { Link, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CarFront, House, UserRound, WalletCards } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DriverActiveRideRecovery } from "@/components/DriverActiveRideRecovery";

const ITEMS = [
  { to: "/motorista/app", label: "Início", icon: House },
  { to: "/motorista/corridas", label: "Corridas", icon: CarFront },
  { to: "/motorista/carteira", label: "Carteira", icon: WalletCards },
  { to: "/motorista/notificacoes", label: "Notificações", icon: Bell },
  { to: "/motorista/perfil", label: "Perfil", icon: UserRound },
] as const;

const ACTIVE_RIDE_STATUSES = ["motorista_a_caminho", "motorista_chegou", "em_viagem"] as const;

function isActivePath(pathname: string, to: (typeof ITEMS)[number]["to"]) {
  if (to === "/motorista/app") return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function ApoisDriverBottomNav({ hidden = false }: { hidden?: boolean }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [rideActive, setRideActive] = useState(false);
  const [checkingRide, setCheckingRide] = useState(!hidden);
  const requestIdRef = useRef(0);
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);

  useEffect(() => {
    if (hidden) {
      setRideActive(false);
      setCheckingRide(false);
    }
  }, [hidden]);

  useEffect(() => {
    if (hidden) return;

    let alive = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let driverId: string | null = null;

    const refreshRideState = async () => {
      if (!driverId || !alive) return;
      if (refreshInFlightRef.current) {
        refreshQueuedRef.current = true;
        return;
      }

      refreshInFlightRef.current = true;
      const requestId = ++requestIdRef.current;
      try {
        const { data, error } = await supabase
          .from("rides")
          .select("id")
          .eq("driver_id", driverId)
          .in("status", [...ACTIVE_RIDE_STATUSES])
          .limit(1);
        if (!alive || requestId !== requestIdRef.current) return;
        if (error) {
          if (import.meta.env.DEV) {
            console.warn("[APOIS Motorista] não foi possível confirmar corrida ativa para a navegação", error);
          }
          return;
        }
        setRideActive((data?.length ?? 0) > 0);
      } finally {
        if (alive && requestId === requestIdRef.current) setCheckingRide(false);
        refreshInFlightRef.current = false;
        if (refreshQueuedRef.current && alive) {
          refreshQueuedRef.current = false;
          void refreshRideState();
        }
      }
    };

    void (async () => {
      setCheckingRide(true);
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (!alive) return;
        if (authError || !authData.user) {
          setRideActive(false);
          setCheckingRide(false);
          return;
        }

        const { data: profile, error: profileError } = await supabase.rpc("driver_get_profile");
        if (!alive) return;
        const profileId =
          profile &&
          typeof profile === "object" &&
          !Array.isArray(profile) &&
          typeof profile.id === "string" &&
          profile.id.trim()
            ? profile.id.trim()
            : null;
        if (profileError || !profileId) {
          if (profileError && import.meta.env.DEV) {
            console.warn("[APOIS Motorista] perfil indisponível para a navegação", profileError);
          }
          setRideActive(false);
          setCheckingRide(false);
          return;
        }

        driverId = profileId;
        await refreshRideState();
        if (!alive) return;

        channel = supabase
          .channel(`driver-bottom-nav-active-ride-${profileId}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "rides", filter: `driver_id=eq.${profileId}` },
            () => void refreshRideState(),
          )
          .subscribe();
      } catch (error) {
        if (!alive) return;
        if (import.meta.env.DEV) console.warn("[APOIS Motorista] falha ao preparar navegação", error);
        setRideActive(false);
        setCheckingRide(false);
      }
    })();

    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshRideState();
    };
    const onFocus = () => void refreshRideState();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);

    return () => {
      alive = false;
      requestIdRef.current += 1;
      refreshQueuedRef.current = false;
      refreshInFlightRef.current = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [hidden]);

  const showNav = !hidden && !rideActive;

  return (
    <>
      <DriverActiveRideRecovery />
      {showNav && (
        <nav
          className="fixed inset-x-0 bottom-0 z-[35] min-w-0 overflow-x-hidden pt-1.5 shadow-[0_-18px_46px_rgba(0,0,0,.52)] backdrop-blur-2xl"
          style={{
            paddingBottom: "max(env(safe-area-inset-bottom), 7px)",
            paddingLeft: "max(env(safe-area-inset-left), 8px)",
            paddingRight: "max(env(safe-area-inset-right), 8px)",
            background: "linear-gradient(180deg, rgba(8,10,12,.90), rgba(4,5,6,.985))",
            borderTop: "1px solid rgba(246,190,28,.12)",
          }}
          aria-label="Navegação principal do motorista"
          aria-busy={checkingRide}
        >
          <div className="mx-auto grid min-h-[70px] w-full max-w-md grid-cols-5 gap-1">
            {ITEMS.map((item) => {
              const active = isActivePath(pathname, item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  aria-label={item.label}
                  className={`group relative flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-0.5 text-zinc-400 transition-all duration-200 active:scale-[.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F6BE1C] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050607] motion-reduce:transition-none motion-reduce:active:scale-100 ${
                    active ? "driver-nav-active bg-[#F6BE1C]/[.08] text-[#F6BE1C] ring-1 ring-inset ring-[#F6BE1C]/15" : ""
                  }`}
                >
                  <span
                    className={`driver-nav-indicator absolute top-1.5 h-0.5 rounded-full transition-all duration-200 motion-reduce:transition-none ${
                      active ? "w-5 bg-[#F6BE1C]" : "w-4 bg-transparent"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="driver-nav-icon relative mt-1 flex h-8 w-10 items-center justify-center rounded-xl transition-all duration-200 motion-reduce:transition-none" aria-hidden="true">
                    <item.icon className="h-5 w-5" strokeWidth={1.9} />
                  </span>
                  <span className="max-w-full break-words text-center text-[11px] font-extrabold leading-3 tracking-tight">
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
