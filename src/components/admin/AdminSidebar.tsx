import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Car,
  Route as RouteIcon,
  Tag,
  DollarSign,
  CreditCard,
  Ticket,
  Bell,
  Settings,
  FileBarChart,
  Map as MapIcon,
  ShieldCheck,
  LogOut,
  Layers,
  type LucideIcon,
} from "lucide-react";
import { MovviLogo } from "@/components/MovviLogo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";

type Item = { to: string; label: string; icon: LucideIcon };

export const ADMIN_NAV: Item[] = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/motoristas", label: "Motoristas", icon: Car },
  { to: "/admin/passageiros", label: "Passageiros", icon: Users },
  { to: "/admin/corridas", label: "Corridas", icon: RouteIcon },
  { to: "/admin/categorias", label: "Categorias", icon: Layers },
  { to: "/admin/tarifas", label: "Tarifas", icon: DollarSign },
  { to: "/admin/assinaturas", label: "Assinaturas", icon: CreditCard },
  { to: "/admin/financeiro", label: "Financeiro", icon: FileBarChart },
  { to: "/admin/cupons", label: "Cupons", icon: Ticket },
  { to: "/admin/notificacoes", label: "Notificações", icon: Bell },
  { to: "/admin/mapa", label: "Mapa ao vivo", icon: MapIcon },
  { to: "/admin/configuracoes", label: "Configurações", icon: Settings },
  { to: "/admin/relatorios", label: "Relatórios", icon: FileBarChart },
  { to: "/admin/seguranca", label: "Segurança", icon: ShieldCheck },
];

export function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  return (
    <aside className="flex h-full w-64 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <MovviLogo className="h-7 w-auto" />
        <div className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-primary">
          Admin
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-1">
          {ADMIN_NAV.map(({ to, label, icon: Icon }) => {
            const active = pathname === to || pathname.startsWith(`${to}/`);
            return (
              <li key={to}>
                <Link
                  to={to}
                  onClick={onNavigate}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                    active
                      ? "bg-primary/15 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-border p-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/admin/login" });
          }}
        >
          <LogOut className="mr-2 h-4 w-4" /> Sair
        </Button>
      </div>
    </aside>
  );
}
