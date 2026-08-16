import { useCallback, useEffect, useState } from "react";
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
  RefreshCw,
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
  {
    to: "/motorista/app",
    label: "Início",
    description: "Mapa e novas corridas",
    icon: Home,
  },
  {
    to: "/motorista/corridas",
    label: "Corridas",
    description: "Histórico e detalhes",
    icon: ClipboardList,
  },
  {
    to: "/motorista/carteira",
    label: "Carteira",
    description: "Saldo e movimentações",
    icon: Coins,
  },
  {
    to: "/motorista/ganhos",
    label: "Financeiro",
    description: "Ganhos e repasses",
    icon: Wallet,
  },
  {
    to: "/motorista/notificacoes",
    label: "Notificações",
    description: "Alertas e avisos da APOIS",
    icon: Bell,
  },
  {
    to: "/motorista/perfil",
    label: "Perfil",
    description: "Conta, veículo e documentos",
    icon: UserIcon,
  },
  {
    to: "/motorista/seguranca",
    label: "Segurança",
    description: "SOS e recursos da corrida",
    icon: ShieldAlert,
  },
  {
    to: "/motorista/status",
    label: "Status do cadastro",
    description: "Acompanhe sua análise",
    icon: ShieldCheck,
  },
  {
    to: "/motorista/suporte",
    label: "Ajuda",
    description: "Fale com a APOIS",
    icon: LifeBuoy,
  },
  {
    to: "/motorista/configuracoes",
    label: "Configurações",
    description: "Preferências do aplicativo",
    icon: Settings,
  },
] as const;

function normalizeApprovalStatus(status: DriverProfileRow["approval_status"] | undefined) {
  return String(status ?? "").trim().toLowerCase();
}

function approvalLabel(status: DriverProfileRow["approval_status"] | undefined) {
  switch (normalizeApprovalStatus(status)) {
    case "aprovado":
    case "approved":
      return {
        text: "Cadastro aprovado",
        className: "text-emerald-400 border-emerald-400/20 bg-emerald-400/10",
      };
    case "reprovado":
    case "rejected":
      return {
        text: "Cadastro reprovado",
        className: "text-red-400 border-red-400/20 bg-red-400/10",
      };
    case "bloqueado":
    case "blocked":
    case "suspended":
      return {
        text: "Cadastro bloqueado",
        className: "text-red-400 border-red-400/20 bg-red-400/10",
      };
    default:
      return {
        text: "Cadastro em análise",
        className: "text-[#F6BE1C] border-[#F6BE1C]/20 bg-[#F6BE1C]/10",
      };
  }
}

function safeEmail(value: string | null | undefined) {
  return String(value ?? "").trim();
}

export function DriverSideMenu({ open, onOpenChange, onLogout }: Props) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profile, setProfile] = useState<DriverProfileRow | null>(null);
  const [email, setEmail] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const requestReload = useCallback(() => {
    setReloadKey((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [{ data: authData, error: authError }, profileResult] = await Promise.all([
          supabase.auth.getUser(),
          loadDriverProfile(),
        ]);
        if (cancelled) return;
        if (authError) throw authError;

        const nextEmail = safeEmail(authData.user?.email);
        setEmail(nextEmail);

        if (profileResult.ok) {
          setProfile(profileResult.profile);
          const storedPhoto = String(
            profileResult.profile.photo_url ?? profileResult.profile.selfie_url ?? "",
          ).trim();
          if (!storedPhoto) {
            setPhotoUrl(null);
          } else if (/^https?:\/\//i.test(storedPhoto)) {
            setPhotoUrl(storedPhoto);
          } else {
            const refreshed = await refreshProfilePhotoUrl(storedPhoto);
            if (!cancelled) setPhotoUrl(refreshed ?? null);
          }
        } else {
          setProfile(null);
          setPhotoUrl(null);
          if (profileResult.reason !== "no_session") {
            setLoadError("Não foi possível carregar todos os dados da sua conta.");
          }
        }
      } catch {
        if (!cancelled) {
          setProfile(null);
          setPhotoUrl(null);
          setLoadError("Não foi possível carregar sua conta. Verifique a conexão e tente novamente.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, reloadKey]);

  const status = approvalLabel(profile?.approval_status);
  const profileName = String(profile?.name ?? "").trim();
  const emailAlias = email.includes("@") ? email.split("@")[0]?.trim() : email;
  const displayName = profileName || emailAlias || "Motorista";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-[90vw] max-w-sm overflow-y-auto border-r border-[#F6BE1C]/10 bg-[#08090A] p-0 text-white shadow-[26px_0_80px_rgba(0,0,0,.6)]"
      >
        <SheetHeader className="border-b border-white/5 bg-[radial-gradient(circle_at_15%_0%,rgba(246,190,28,.10),transparent_38%),#0D0F11] px-5 pb-5 pr-16 pt-[calc(env(safe-area-inset-top)+18px)] text-left">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <MovviLogo size={48} />
            <div className="min-w-0 text-right">
              <SheetTitle className="break-words text-xs font-black uppercase tracking-[0.18em] text-[#F6BE1C]">
                Menu
              </SheetTitle>
              <SheetDescription className="mt-1 break-words text-[11px] font-medium text-zinc-500">
                APOIS Motorista
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500" role="status" aria-live="polite">
              <Loader2 className="h-4 w-4 animate-spin text-[#F6BE1C] motion-reduce:animate-none" aria-hidden="true" />
              Carregando sua conta...
            </div>
          ) : (
            <>
              {loadError ? (
                <div role="alert" className="rounded-[18px] border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">
                  <p className="break-words">{loadError}</p>
                  <button
                    type="button"
                    onClick={requestReload}
                    className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-300/25 bg-black/20 px-3 py-2 text-xs font-bold text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F6BE1C]"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    Tentar novamente
                  </button>
                </div>
              ) : null}

              <Link
                to="/motorista/perfil"
                onClick={() => onOpenChange(false)}
                className="flex min-w-0 items-center gap-3 rounded-[22px] border border-[#F6BE1C]/10 bg-[linear-gradient(145deg,#121518,#0d0f11)] p-4 shadow-[0_16px_36px_-28px_rgba(246,190,28,.45)] transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F6BE1C] motion-reduce:transform-none"
              >
                <div className="shrink-0 rounded-full border border-[#F6BE1C]/30 bg-[#F6BE1C]/5 p-0.5 shadow-[0_0_24px_rgba(246,190,28,.08)]">
                  <Avatar src={photoUrl} name={displayName} size={54} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[15px] font-black leading-5 text-white">{displayName}</p>
                  {email ? <p className="mt-0.5 break-all text-xs font-medium text-zinc-500">{email}</p> : null}
                  <span className={`mt-2 inline-flex max-w-full rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.08em] ${status.className}`}>
                    <span className="break-words">{status.text}</span>
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" aria-hidden="true" />
              </Link>

              <nav className="space-y-2" aria-label="Navegação do motorista">
                {NAV_LINKS.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    activeOptions={{ exact: item.to === "/motorista/app" }}
                    onClick={() => onOpenChange(false)}
                    className="driver-menu-link group flex min-h-[64px] min-w-0 items-center gap-3 rounded-[20px] border border-white/5 bg-[#101214] px-3.5 py-3 transition hover:border-white/10 hover:bg-[#15181B] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F6BE1C] motion-reduce:transform-none"
                    activeProps={{
                      className:
                        "driver-menu-active border-[#F6BE1C]/25 bg-[#F6BE1C]/[.08] shadow-[0_12px_30px_-24px_rgba(246,190,28,.6)]",
                    }}
                  >
                    <div className="driver-menu-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-black text-[#F6BE1C] ring-1 ring-inset ring-white/5 transition-all duration-200 motion-reduce:transition-none">
                      <item.icon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-[13px] font-black leading-5 text-white">{item.label}</p>
                      <p className="mt-0.5 break-words text-xs font-medium leading-4 text-zinc-500">
                        {item.description}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-zinc-700 transition group-hover:text-[#F6BE1C]" aria-hidden="true" />
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
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[18px] border border-red-500/20 bg-red-500/8 px-4 text-[12px] font-black uppercase tracking-[0.12em] text-red-400 transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 motion-reduce:transform-none"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
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
