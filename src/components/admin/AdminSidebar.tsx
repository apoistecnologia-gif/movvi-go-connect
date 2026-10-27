import { APOIS_OFFICIAL_RED_LOGO_URL } from "@/assets/apoisOfficial2026";
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
  Loader2,
  RefreshCw,
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
  {
    to: "/admin/operacoes",
    label: "Central de Operações",
    icon: Radio,
    permission: "operations.read",
  },
  { to: "/admin/motoristas", label: "Motoristas", icon: Car, permission: "drivers.read" },
  { to: "/admin/passageiros", label: "Passageiros", icon: Users, permission: "passengers.read" },
  { to: "/admin/corridas", label: "Corridas", icon: RouteIcon, permission: "rides.read" },
  { to: "/admin/categorias", label: "Categorias", icon: Layers, permission: "pricing.read" },
  { to: "/admin/precos", label: "Tarifas", icon: DollarSign, permission: "pricing.read" },
  { to: "/admin/financeiro", label: "Financeiro", icon: Wallet, permission: "finance.read" },
  { to: "/admin/suporte", label: "Suporte", icon: LifeBuoy, permission: "support.read" },
  { to: "/admin/seguranca", label: "Segurança", icon: Lock, permission: "operations.read" },
  {
    to: "/admin/administradores",
    label: "Equipe administrativa",
    icon: ShieldCheck,
    permission: "roles.manage",
  },
  { to: "/admin/logs", label: "Auditoria", icon: ScrollText, permission: "audit.read" },
];

function cleanLabel(value: unknown, fallback: string) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  return text || fallback;
}

function SidebarBrand() {
  return (
    <div className="flex flex-col items-center gap-2" role="img" aria-label="APOIS Corridas — Administração">
      <img
        src={APOIS_OFFICIAL_RED_LOGO_URL}
        alt=""
        aria-hidden="true"
        decoding="async"
        className="h-16 w-16 rounded-full bg-white object-contain shadow-[0_8px_22px_rgba(229,27,35,0.15)]"
      />
      <span className="font-display text-sm font-black tracking-[0.14em] text-foreground" aria-hidden="true">
        APOIS <span className="text-primary">CORRIDAS</span>
      </span>
      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground" aria-hidden="true">Administração</span>
    </div>
  );
}

export function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const [access, setAccess] = useState<AdminAccessContext | null>(null);
  const [loadingAccess, setLoadingAccess] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  async function refreshAccess() {
    setLoadingAccess(true);
    setAccessError(null);
    try {
      const next = await loadAdminAccess();
      setAccess(next);
      if (!next) setAccessError("Não foi possível confirmar as permissões administrativas.");
    } catch (error) {
      setAccess(null);
      setAccessError("Não foi possível carregar suas permissões agora.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao carregar permissões do menu", error);
    } finally {
      setLoadingAccess(false);
    }
  }

  useEffect(() => {
    let alive = true;
    setLoadingAccess(true);
    void loadAdminAccess()
      .then((next) => {
        if (!alive) return;
        setAccess(next);
        setAccessError(next ? null : "Não foi possível confirmar as permissões administrativas.");
      })
      .catch((error) => {
        if (!alive) return;
        setAccess(null);
        setAccessError("Não foi possível carregar suas permissões agora.");
        if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao carregar permissões do menu", error);
      })
      .finally(() => {
        if (alive) setLoadingAccess(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const visibleNav = useMemo(() => {
    if (!access) return [];
    const permissionSet = new Set(access.permissions.filter(Boolean));
    return ADMIN_NAV.filter((item) => permissionSet.has(item.permission));
  }, [access]);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setLogoutError(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      onNavigate?.();
      await navigate({ to: "/admin/login", replace: true });
    } catch (error) {
      setLogoutError("Não foi possível sair da conta agora. Tente novamente.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao encerrar sessão", error);
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <aside className="flex h-full w-[260px] max-w-full min-w-0 flex-col overflow-x-hidden border-r border-border/60 bg-card text-card-foreground">
      <div className="relative px-5 pb-5 pt-6">
        <span className="absolute right-3 top-3 max-w-[85%] break-words rounded-lg border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-bold uppercase tracking-[0.12em] text-primary">
          {loadingAccess ? "…" : cleanLabel(access?.role, "Admin")}
        </span>
        <div className="flex justify-center">
          <SidebarBrand />
        </div>
      </div>

      <div className="mx-5 h-px bg-gradient-to-r from-transparent via-border to-transparent" aria-hidden="true" />

      <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4" aria-label="Seções administrativas">
        {loadingAccess ? (
          <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground" role="status" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Carregando menu…
          </div>
        ) : accessError ? (
          <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3" role="alert">
            <p className="break-words text-sm text-destructive">{accessError}</p>
            <DSButton
              variant="outline"
              size="sm"
              className="min-h-11 w-full gap-2"
              onClick={() => void refreshAccess()}
              disabled={loadingAccess}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Tentar novamente
            </DSButton>
          </div>
        ) : visibleNav.length === 0 ? (
          <p className="px-3 py-4 text-sm leading-6 text-muted-foreground">
            Nenhuma seção administrativa está liberada para esta função.
          </p>
        ) : (
          <ul className="space-y-1">
            {visibleNav.map(({ to, label, icon: Icon }) => {
              const active = pathname === to || pathname.startsWith(`${to}/`);
              return (
                <li key={to}>
                  <Link
                    to={to}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "group relative flex min-h-11 min-w-0 items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none",
                      "transition-all duration-200 ease-out motion-reduce:transform-none motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-primary",
                      active
                        ? "bg-primary/15 text-primary shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-primary)_25%,transparent),0_0_20px_-6px_color-mix(in_oklab,var(--color-primary)_55%,transparent)]"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground hover:translate-x-0.5 motion-reduce:hover:translate-x-0",
                    ].join(" ")}
                  >
                    {active ? (
                      <span
                        className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary shadow-[0_0_10px_color-mix(in_oklab,var(--color-primary)_70%,transparent)]"
                        aria-hidden="true"
                      />
                    ) : null}
                    <Icon
                      className={[
                        "h-[18px] w-[18px] shrink-0 transition-colors motion-reduce:transition-none",
                        active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                      ].join(" ")}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 break-words leading-5">{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      <div className="border-t border-border/60 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {logoutError ? (
          <p className="mb-2 break-words text-sm text-destructive" role="alert">
            {logoutError}
          </p>
        ) : null}
        <DSButton
          variant="ghost"
          size="sm"
          className="min-h-11 w-full justify-start px-3 text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
          onClick={() => void signOut()}
          disabled={signingOut}
          aria-busy={signingOut}
        >
          {signingOut ? (
            <Loader2 className="mr-3 h-[18px] w-[18px] animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <LogOut className="mr-3 h-[18px] w-[18px]" aria-hidden="true" />
          )}
          {signingOut ? "Saindo…" : "Sair"}
        </DSButton>
      </div>
    </aside>
  );
}
