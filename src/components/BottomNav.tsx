import { Link, useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  Home,
  ClipboardList,
  Heart,
  User,
  DollarSign,
  Settings,
  LayoutGrid,
} from "lucide-react";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
};

/**
 * MOVVI BottomNav — floating pill nav.
 *
 * - `floating` mode: pill flutuante sobre o conteúdo/mapa, safe-area aware.
 * - `sticky` mode: barra ancorada no rodapé com fundo blur.
 *
 * Item ativo ganha um "pill" verde MOVVI atrás do ícone; ícone e label
 * viram foreground contrastante. Layout responsivo até 360px de largura.
 */

type NavTheme = "auto" | "dark" | "light";

export const PASSENGER_NAV: NavItem[] = [
  { to: "/passageiro/app", label: "Início", icon: Home },
  { to: "/passageiro/servicos", label: "Serviços", icon: LayoutGrid },
  { to: "/passageiro/corridas", label: "Atividade", icon: ClipboardList },
  { to: "/passageiro/perfil", label: "Conta", icon: User },
];

export const DRIVER_NAV: NavItem[] = [
  { to: "/motorista/app", label: "Início", icon: Home },
  { to: "/motorista/ganhos", label: "Ganhos", icon: DollarSign },
  { to: "/motorista/corridas", label: "Corridas", icon: ClipboardList },
  { to: "/motorista/perfil", label: "Conta", icon: User },
  { to: "/motorista/configuracoes", label: "Config.", icon: Settings },
];

interface BottomNavProps {
  items: NavItem[];
  /** Quando true, fica flutuando sobre o conteúdo/mapa */
  floating?: boolean;
  /** Força o tema visual do container. `auto` (padrão) usa card do tema atual. */
  theme?: NavTheme;
  /** Offset extra no bottom (CSS length). Útil quando existe um bottom sheet acima. */
  bottomOffset?: string;
  /** z-index override (padrão 40). */
  zIndex?: number;
}

export function BottomNav({
  items,
  floating = false,
  theme = "auto",
  bottomOffset = "0px",
  zIndex,
}: BottomNavProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Container palette — pill flutuante fica escuro por padrão para a identidade MOVVI.
  const containerBg =
    theme === "dark"
      ? "bg-[#0B0F17]/95 ring-white/[0.08]"
      : theme === "light"
      ? "bg-white/95 ring-black/5"
      : "bg-card/95 ring-border";

  return (
    <nav
      className={
        floating
          ? "pointer-events-none fixed inset-x-0 bottom-0 px-3"
          : "sticky bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur-md"
      }
      style={
        floating
          ? {
              paddingBottom: `calc(env(safe-area-inset-bottom) + 10px + ${bottomOffset})`,
              paddingTop: 8,
              zIndex: zIndex ?? 40,
            }
          : { paddingBottom: "env(safe-area-inset-bottom)" }
      }
      aria-label="Navegação principal"
    >
      <ul
        className={
          floating
            ? `pointer-events-auto mx-auto flex max-w-md items-stretch gap-1 rounded-full px-2 py-1.5 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.55)] ring-1 backdrop-blur-xl ${containerBg}`
            : "mx-auto flex h-16 max-w-xl items-stretch justify-between px-2"
        }
      >
        {items.map((item) => {
          const active =
            pathname === item.to ||
            (item.to !== "/" && pathname.startsWith(item.to));
          const Icon = item.icon;

          const activeCls = active
            ? floating
              ? "bg-primary text-primary-foreground shadow-[0_8px_20px_-10px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]"
              : "text-primary"
            : floating
            ? "text-foreground/70 hover:text-foreground"
            : "text-muted-foreground hover:text-foreground";

          return (
            <li key={item.to} className="flex-1">
              <Link
                to={item.to}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={
                  floating
                    ? `group relative flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold tracking-tight transition-all duration-300 ease-out ${activeCls}`
                    : `relative flex h-full min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium transition-colors ${activeCls}`
                }
              >
                {floating ? (
                  <>
                    <Icon
                      className={`h-[18px] w-[18px] shrink-0 transition-transform duration-300 ${
                        active ? "scale-105" : "group-active:scale-95"
                      }`}
                      strokeWidth={active ? 2.4 : 2}
                    />
                    {/* Label aparece só no item ativo — como as refs modernas */}
                    <span
                      className={`overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-300 ease-out ${
                        active
                          ? "max-w-[110px] opacity-100"
                          : "max-w-0 opacity-0"
                      }`}
                    >
                      {item.label}
                    </span>
                  </>
                ) : (
                  <>
                    {active && (
                      <span className="absolute -top-0.5 h-0.5 w-6 rounded-full bg-primary shadow-[0_0_8px_rgba(141,217,43,0.7)]" />
                    )}
                    <Icon
                      className={`h-[18px] w-[18px] transition-transform duration-300 ${
                        active
                          ? "scale-110 drop-shadow-[0_0_8px_rgba(141,217,43,0.55)]"
                          : ""
                      }`}
                    />
                    <span className="leading-none">{item.label}</span>
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
