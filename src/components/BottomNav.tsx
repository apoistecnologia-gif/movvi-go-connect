import { Link, useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  Home,
  ClipboardList,
  Heart,
  User,
  DollarSign,
  Settings,
} from "lucide-react";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
};

export const PASSENGER_NAV: NavItem[] = [
  { to: "/passageiro/app", label: "Início", icon: Home },
  { to: "/passageiro/corridas", label: "Corridas", icon: ClipboardList },
  { to: "/passageiro/favoritos", label: "Favoritos", icon: Heart },
  { to: "/passageiro/perfil", label: "Perfil", icon: User },
];

export const DRIVER_NAV: NavItem[] = [
  { to: "/motorista/app", label: "Início", icon: Home },
  { to: "/motorista/corridas", label: "Corridas", icon: ClipboardList },
  { to: "/motorista/ganhos", label: "Ganhos", icon: DollarSign },
  { to: "/motorista/perfil", label: "Perfil", icon: User },
  { to: "/motorista/configuracoes", label: "Config.", icon: Settings },
];

interface BottomNavProps {
  items: NavItem[];
  /** Quando true, fica flutuando sobre o mapa */
  floating?: boolean;
}

export function BottomNav({ items, floating = false }: BottomNavProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      className={
        floating
          ? "fixed inset-x-0 bottom-0 z-40 px-2"
          : "sticky bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur-md"
      }
      style={
        floating
          ? { paddingBottom: "calc(env(safe-area-inset-bottom) + 6px)", paddingTop: 6 }
          : undefined
      }
      aria-label="Navegação principal"
    >
      <ul
        className={
          floating
            ? "mx-auto flex max-w-xl items-center justify-between gap-0.5 rounded-2xl bg-card/95 px-1.5 py-1 shadow-2xl ring-1 ring-border backdrop-blur-xl"
            : "mx-auto flex h-16 max-w-xl items-center justify-between px-2"
        }
      >
        {items.map((item) => {
          const active =
            pathname === item.to ||
            (item.to !== "/" && pathname.startsWith(item.to));
          const Icon = item.icon;
          return (
            <li key={item.to} className="flex-1">
              <Link
                to={item.to}
                className={`relative flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-medium transition-all duration-300 ease-out ${
                  active
                    ? "text-primary scale-105"
                    : "text-muted-foreground hover:text-foreground active:scale-95"
                }`}
              >
                {active && (
                  <span className="absolute -top-0.5 h-0.5 w-6 rounded-full bg-primary shadow-[0_0_8px_rgba(141,217,43,0.7)] animate-in fade-in slide-in-from-top-1 duration-300" />
                )}
                <Icon
                  className={`h-[18px] w-[18px] transition-transform duration-300 ${
                    active ? "drop-shadow-[0_0_8px_rgba(141,217,43,0.55)] scale-110" : ""
                  }`}
                />
                <span className="leading-none">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
