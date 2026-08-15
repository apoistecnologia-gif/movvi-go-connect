import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bell,
  ChevronRight,
  ClipboardList,
  Coins,
  Home,
  LifeBuoy,
  Loader2,
  LogOut,
  Settings,
  ShieldAlert,
  ShieldCheck,
  User as UserIcon,
  Wallet,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Avatar } from "@/components/Avatar";
import { MovviLogo } from "@/components/MovviLogo";
import { loadDriverProfile, type DriverProfileRow } from "@/lib/driverProfile";
import { refreshProfilePhotoUrl } from "@/lib/profilePhoto";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogout?: () => void;
};

const NAV_LINKS = [
  { to: "/motorista/app", label: "Início", description: "Mapa e novas corridas", icon: Home },
  { to: "/motorista/corridas", label: "Corridas", description: "Histórico e detalhes", icon: ClipboardList },
  { to: "/motorista/carteira", label: "Carteira", description: "Saldo e movimentações", icon: Coins },
  { to: "/motorista/ganhos", label: "Financeiro", description: "Ganhos e repasses", icon: Wallet },
  { to: "/motorista/notificacoes", label: "Avisos", description: "Notificações da APOIS", icon: Bell },
  { to: "/motorista/perfil", label: "Perfil", description: "Conta, veículo e documentos", icon: UserIcon },
  { to: "/motorista/seguranca", label: "Segurança", description: "SOS e recursos da corrida", icon: ShieldAlert },
  { to: "/motorista/status", label: "Status do cadastro", description: "Acompanhe sua análise", icon: ShieldCheck },
  { to: "/motorista/suporte", label: "Ajuda", description: "Fale com a APOIS", icon: LifeBuoy },
  { to: "/motorista/configuracoes", label: "Configurações", description: "Preferências do aplicativo", icon: Settings },
] as const;

function approvalLabel(status: DriverProfileRow["approval_status"] | undefined) {
  switch (status) {
    case "aprovado":
      return { text: "Cadastro aprovado", className: "text-emerald-400 border-emerald-400/20 bg-emerald-400/10" };
    case "reprovado":
      return { text: "Cadastro reprovado", className: "text-red-400 border-red-400/20 bg-red-400/10" };
    case "bloqueado":
      return { text: "Cadastro bloqueado", className: "text-red-400 border-red-400/20 bg-red-400/10" };
    default:
      return { text: "Cadastro em análise", className: "text-[#F6BE1C] border-[#F6BE1C]/20 bg-[#F6BE1C]/10" };
  }
}

export function DriverSideMenu({ open, onOpenChange, onLogout }: Props) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<DriverProfileRow | null>(null);
  const [email, setEmail] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void (async () => {
      setLoading(true);
      const [{ data: authData }, profileResult] = await Promise.all([
        supabase.auth.getUser(),
        loadDriverProfile(),
      ]);
      if (cancelled) return;

      setEmail(authData.user?.email ?? "");
      if (profileResult.ok) {
        setProfile(profileResult.profile);
        const storedPhoto = profileResult.profile.photo_url ?? profileResult.profile.selfie_url;
        if (storedPhoto) {
          if (/^https?:\/\//i.test(storedPhoto)) setPhotoUrl(storedPhoto);
          else setPhotoUrl((await refreshProfilePhotoUrl(storedPhoto)) ?? null);
        } else {
          setPhotoUrl(null);
        }
      } else {
        setProfile(null);
        setPhotoUrl(null);
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const status = approvalLabel(profile?.approval_status);
  const displayName = profile?.name?.trim() || email.split("@")[0] || "Motorista";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-[90vw] max-w-sm overflow-y-auto border-r border-white/5 bg-[#08090A] p-0 text-white"
      >
        <SheetHeader className="border-b border-white/5 bg-[#0D0F11] px-5 pb-5 pt-[calc(env(safe-area-inset-top)+18px)] text-left">
          <div className="flex items-center justify-between gap-3">
            <MovviLogo size={48} />
            <div className="text-right">
              <SheetTitle className="text-[11px] font-black uppercase tracking-[0.2em] text-[#F6BE1C]">
                Menu
              </SheetTitle>
              <SheetDescription className="mt-1 text-[10px] font-medium text-zinc-500">
                APOIS Motorista
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-5 px-4 py-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin text-[#F6BE1C]" />
              Carregando sua conta...
            </div>
          ) : (
            <>
              <Link
                to="/motorista/perfil"
                onClick={() => onOpenChange(false)}
                className="flex items-center gap-3 rounded-[22px] border border-white/5 bg-[#111315] p-4 transition active:scale-[0.99]"
              >
                <div className="shrink-0 rounded-full border border-[#F6BE1C]/20 p-0.5">
                  <Avatar src={photoUrl} name={displayName} size={54} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-black text-white">{displayName}</p>
                  <p className="mt-0.5 truncate text-[11px] font-medium text-zinc-500">{email}</p>
                  <span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${status.className}`}>
                    {status.text}
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" />
              </Link>

              <nav className="space-y-2" aria-label="Navegação do motorista">
                {NAV_LINKS.map((item, index) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => onOpenChange(false)}
                    className={`group flex min-h-[64px] items-center gap-3 rounded-[20px] border px-3.5 py-3 transition active:scale-[0.99] ${
                      index === 0
                        ? "border-[#F6BE1C]/25 bg-[#F6BE1C]/10"
                        : "border-white/5 bg-[#101214] hover:border-white/10 hover:bg-[#15181B]"
                    }`}
                  >
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                      index === 0 ? "bg-[#F6BE1C] text-black" : "bg-black text-[#F6BE1C]"
                    }`}>
                      <item.icon className="h-[18px] w-[18px]" strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-black text-white">{item.label}</p>
                      <p className="mt-0.5 truncate text-[10.5px] font-medium text-zinc-500">
                        {item.description}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-zinc-700 transition group-hover:text-[#F6BE1C]" />
                  </Link>
                ))}
              </nav>

              {onLogout ? (
                <button
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    onLogout();
                  }}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[18px] border border-red-500/20 bg-red-500/8 px-4 text-[12px] font-black uppercase tracking-[0.12em] text-red-400 transition active:scale-[0.99]"
                >
                  <LogOut className="h-4 w-4" />
                  Sair do aplicativo
                </button>
              ) : null}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
