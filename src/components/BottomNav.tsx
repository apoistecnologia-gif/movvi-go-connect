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
          ? "fixed inset-x-0 bottom-0 z-30 px-3 pb-3"
          : "sticky bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur-md"
      }
      aria-label="Navegação principal"
    >
      <ul
        className={
          floating
            ? "mx-auto flex max-w-xl items-center justify-between gap-1 rounded-2xl bg-card/95 px-2 py-2 shadow-2xl ring-1 ring-border backdrop-blur-xl"
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
                className={`flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-medium transition ${
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon
                  className={`h-5 w-5 ${active ? "drop-shadow-[0_0_8px_rgba(141,217,43,0.45)]" : ""}`}
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
