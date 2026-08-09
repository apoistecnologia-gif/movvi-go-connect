import { Link } from "@tanstack/react-router";
import { Bell, CarFront, House, UserRound, WalletCards } from "lucide-react";

const ITEMS = [
  { to: "/motorista/app", label: "Início", icon: House },
  { to: "/motorista/corridas", label: "Corridas", icon: CarFront },
  { to: "/motorista/carteira", label: "Carteira", icon: WalletCards },
  { to: "/motorista/notificacoes", label: "Notificações", icon: Bell },
  { to: "/motorista/perfil", label: "Perfil", icon: UserRound },
] as const;

export function ApoisDriverBottomNav({ hidden = false }: { hidden?: boolean }) {
  if (hidden) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[35] border-t border-white/5 bg-[#08090A]/98 px-2 backdrop-blur-xl"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 6px)" }}
      aria-label="Navegação principal do motorista"
    >
      <div className="mx-auto grid h-[62px] max-w-md grid-cols-5">
        {ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: true }}
            className="group flex min-w-0 flex-col items-center justify-center gap-1 text-zinc-600 transition"
            activeProps={{ className: "text-[#F6BE1C]" }}
          >
            <div className="relative flex h-7 w-9 items-center justify-center rounded-xl transition group-active:scale-95">
              <item.icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
            </div>
            <span className="max-w-full truncate text-[9px] font-bold">{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
