import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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

export function ApoisDriverBottomNav({ hidden = false }: { hidden?: boolean }) {
  const [rideActive, setRideActive] = useState(false);

  useEffect(() => {
    if (hidden) {
      setRideActive(false);
      return;
    }

    let alive = true;

    const refresh = async () => {
      const { data: profile, error: profileError } = await supabase.rpc("driver_get_profile");
      const profileId =
        profile &&
        typeof profile === "object" &&
        !Array.isArray(profile) &&
        typeof profile.id === "string"
          ? profile.id
          : null;
      if (!alive) return;
      if (profileError || !profileId) {
        setRideActive(false);
        return;
      }

      const { data, error } = await supabase
        .from("rides")
        .select("id")
        .eq("driver_id", profileId)
        .in("status", [...ACTIVE_RIDE_STATUSES])
        .limit(1);
      if (!alive) return;
      if (error) {
        console.warn("[APOIS Motorista] não foi possível confirmar corrida ativa para a navegação", error);
        setRideActive(false);
        return;
      }
      setRideActive((data?.length ?? 0) > 0);
    };

    void refresh();
    const channel = supabase
      .channel("driver-bottom-nav-active-ride")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rides" },
        () => void refresh(),
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [hidden]);

  return (
    <>
      <DriverActiveRideRecovery />
      {!hidden && !rideActive && (
        <nav
          className="fixed inset-x-0 bottom-0 z-[35] pt-1.5 shadow-[0_-18px_46px_rgba(0,0,0,.52)] backdrop-blur-2xl"
          style={{
            paddingBottom: "max(env(safe-area-inset-bottom), 7px)",
            paddingLeft: "max(env(safe-area-inset-left), 8px)",
            paddingRight: "max(env(safe-area-inset-right), 8px)",
            background: "linear-gradient(180deg, rgba(8,10,12,.90), rgba(4,5,6,.985))",
            borderTop: "1px solid rgba(246,190,28,.12)",
          }}
          aria-label="Navegação principal do motorista"
        >
          <div className="mx-auto grid min-h-[70px] max-w-md grid-cols-5 gap-1">
            {ITEMS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: false }}
                className="group relative flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-0.5 text-zinc-500 transition-all duration-200 active:scale-[.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F6BE1C] motion-reduce:transition-none motion-reduce:active:scale-100"
                activeProps={{
                  className:
                    "driver-nav-active text-[#F6BE1C] bg-[#F6BE1C]/[.08] ring-1 ring-inset ring-[#F6BE1C]/15",
                }}
              >
                <span className="driver-nav-indicator absolute top-1.5 h-0.5 w-4 rounded-full bg-transparent transition-all duration-200 motion-reduce:transition-none" aria-hidden="true" />
                <div className="driver-nav-icon relative mt-1 flex h-8 w-10 items-center justify-center rounded-xl transition-all duration-200 motion-reduce:transition-none">
                  <item.icon className="h-[20px] w-[20px]" strokeWidth={1.9} aria-hidden="true" />
                </div>
                <span className="max-w-full break-words text-center text-[10px] font-extrabold leading-3 tracking-tight">
                  {item.label}
                </span>
              </Link>
            ))}
          </div>
        </nav>
      )}
    </>
  );
}
