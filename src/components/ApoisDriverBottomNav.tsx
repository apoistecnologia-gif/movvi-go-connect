import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, CarFront, House, UserRound, WalletCards } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DriverActiveRideRecovery } from "@/components/DriverActiveRideRecovery";
import "@/apois-driver-secondary.css";

const ITEMS = [
  { to: "/motorista/app", label: "Início", icon: House },
  { to: "/motorista/corridas", label: "Corridas", icon: CarFront },
  { to: "/motorista/carteira", label: "Carteira", icon: WalletCards },
  { to: "/motorista/notificacoes", label: "Notificações", icon: Bell },
  { to: "/motorista/perfil", label: "Perfil", icon: UserRound },
] as const;

const ACTIVE_RIDE_STATUSES = ["motorista_a_caminho", "motorista_chegou", "em_viagem"] as const;

/**
 * The parent hides navigation while a ride is active. This canonical-state
 * guard is deliberately redundant: after Android recreates the WebView, a
 * stale React render must never let the bottom navigation cover operational
 * actions such as CHEGUEI, INICIAR CORRIDA or FINALIZAR CORRIDA.
 *
 * Visual refresh note: route targets, realtime recovery and active-ride guard
 * are intentionally unchanged. Only the presentation shell below changed.
 */
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
      if (!alive || profileError || !profileId) return;
      const { data, error } = await supabase
        .from("rides")
        .select("id")
        .eq("driver_id", profileId)
        .in("status", [...ACTIVE_RIDE_STATUSES])
        .limit(1);
      if (!alive || error) return;
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

    return () => {
      alive = false;
      void supabase.removeChannel(channel);
    };
  }, [hidden]);

  return (
    <>
      <DriverActiveRideRecovery />
      {!hidden && !rideActive && (
        <nav
          className="fixed inset-x-0 bottom-0 z-[35] px-2 pt-1.5"
          style={{
            paddingBottom: "max(env(safe-area-inset-bottom), 7px)",
            background:
              "linear-gradient(180deg, rgba(3,4,5,0.25) 0%, rgba(3,4,5,0.96) 18%, #030405 100%)",
          }}
          aria-label="Navegação principal do motorista"
        >
          <div
            className="mx-auto grid h-[70px] max-w-md grid-cols-5 gap-0.5 rounded-t-[24px] border border-b-0 border-white/[0.075] px-1 shadow-[0_-18px_48px_-28px_rgba(0,0,0,0.95)] backdrop-blur-xl"
            style={{ background: "rgba(8,10,12,0.965)" }}
          >
            {ITEMS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: true }}
                className="group relative flex min-w-0 flex-col items-center justify-center gap-0.5 text-zinc-500 transition-colors duration-150"
                activeProps={{ className: "text-[#F6BE1C]" }}
              >
                <div className="relative flex h-[34px] w-[46px] items-center justify-center rounded-[14px] transition duration-150 group-active:scale-95 group-[.active]:bg-[#F6BE1C]/10">
                  <item.icon className="h-[22px] w-[22px]" strokeWidth={2.05} />
                </div>
                <span className="max-w-full truncate text-[9.5px] font-semibold tracking-[-0.01em]">
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
