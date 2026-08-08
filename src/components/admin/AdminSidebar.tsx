import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Car,
  Route as RouteIcon,
  DollarSign,
  LifeBuoy,
  Radio,
  ShieldCheck,
  LogOut,
  Layers,
  Wallet,
  ScrollText,
  Lock,
  type LucideIcon,
} from "lucide-react";
import { DSButton } from "@/design-system";
import { supabase } from "@/integrations/supabase/client";
import { loadAdminAccess, type AdminAccessContext } from "@/lib/adminAccess";

type Item = { to: string; label: string; icon: LucideIcon; permission: string };

/**
 * Only Phase-8 audited modules are exposed here. Historical routes remain in
 * the source tree until the final migration/dead-code pass, but are not offered
 * as operational Admin features while they still depend on legacy schemas or
 * unverified payment/provider contracts.
 */
export const ADMIN_NAV: Item[] = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "metrics.read" },
  { to: "/admin/operacoes", label: "Central de Operações", icon: Radio, permission: "operations.read" },
  { to: "/admin/motoristas", label: "Motoristas", icon: Car, permission: "drivers.read" },
  { to: "/admin/passageiros", label: "Passageiros", icon: Users, permission: "passengers.read" },
  { to: "/admin/corridas", label: "Corridas", icon: RouteIcon, permission: "rides.read" },
  { to: "/admin/categorias", label: "Categorias", icon: Layers, permission: "pricing.read" },
  { to: "/admin/precos", label: "Tarifas", icon: DollarSign, permission: "pricing.read" },
  { to: "/admin/financeiro", label: "Financeiro", icon: Wallet, permission: "finance.read" },
  { to: "/admin/suporte", label: "Suporte", icon: LifeBuoy, permission: "support.read" },
  { to: "/admin/seguranca", label: "Segurança", icon: Lock, permission: "operations.read" },
  { to: "/admin/administradores", label: "Equipe administrativa", icon: ShieldCheck, permission: "roles.manage" },
  { to: "/admin/logs", label: "Auditoria", icon: ScrollText, permission: "audit.read" },
];

function SidebarBrand() {
  return (
    <div className="flex flex-col items-center leading-none">
      <svg
        width="44"
        height="44"
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="APOIS"
        className="drop-shadow-[0_0_12px_color-mix(in_oklab,var(--color-primary)_35%,transparent)]"
      >
        <path d="M18 100 L18 28 L40 28 L60 70 L60 100 Z" fill="currentColor" className="text-foreground" />
        <path
          d="M60 28 Q100 28 100 64 Q100 100 60 100 L60 78 Q82 78 82 64 Q82 50 60 50 Z"
          fill="currentColor"
          className="text-primary"
        />
        <path d="M28 82 Q60 60 95 82" stroke="hsl(220 30% 8%)" strokeWidth="8" strokeLinecap="round" fill="none" />
        <path
          d="M28 82 Q60 60 95 82"
          stroke="currentColor"
          className="text-foreground"
          strokeWidth="1.5"
          strokeDasharray="4 5"
          fill="none"
        />
      </svg>
      <div className="mt-2 flex flex-col items-center leading-[1.05]">
        <span className="font-display text-[15px] font-bold tracking-[0.22em] text-foreground">APOIS</span>
        <span className="font-display text-[12px] font-bold tracking-[0.22em] text-primary">ADMIN</span>
      </div>
    </div>
  );
}

export function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [access, setAccess] = useState<AdminAccessContext | null>(null);

  useEffect(() => {
    let alive = true;
    void loadAdminAccess().then((next) => {
      if (alive) setAccess(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  const visibleNav = useMemo(() => {
    if (!access) return [];
    const permissionSet = new Set(access.permissions);
    return ADMIN_NAV.filter((item) => permissionSet.has(item.permission));
  }, [access]);

  return (
    <aside className="flex h-full w-[260px] flex-col bg-card text-card-foreground border-r border-border/60">
      <div className="relative px-5 pt-6 pb-5">
        <span className="absolute right-3 top-3 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-primary">
          {access?.role ?? "Admin"}
        </span>
        <div className="flex justify-center">
          <SidebarBrand />
        </div>
      </div>

      <div className="mx-5 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {visibleNav.map(({ to, label, icon: Icon }) => {
            const active = pathname === to || pathname.startsWith(`${to}/`);
            return (
              <li key={to}>
                <Link
                  to={to}
                  onClick={onNavigate}
                  className={[
                    "group relative flex h-10 items-center gap-3 rounded-lg pl-3 pr-3 text-[13px] font-medium",
                    "transition-all duration-200 ease-out",
                    active
                      ? "bg-primary/15 text-primary shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-primary)_25%,transparent),0_0_20px_-6px_color-mix(in_oklab,var(--color-primary)_55%,transparent)]"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground hover:translate-x-0.5",
                  ].join(" ")}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary shadow-[0_0_10px_color-mix(in_oklab,var(--color-primary)_70%,transparent)]" />
                  )}
                  <Icon
                    className={[
                      "h-[18px] w-[18px] shrink-0 transition-colors",
                      active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                    ].join(" ")}
                  />
                  <span className="truncate leading-none">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border/60 p-3">
        <DSButton
          variant="ghost"
          size="sm"
          className="w-full justify-start h-10 px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/admin/login" });
          }}
        >
          <LogOut className="mr-3 h-[18px] w-[18px]" /> Sair
        </DSButton>
      </div>
    </aside>
  );
}
