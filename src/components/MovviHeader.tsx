import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Home, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { APOIS_LOGO_DATA_URL } from "@/assets/apoisLogoData";

interface MovviHeaderProps {
  /** "floating" para overlay sobre mapas, "solid" para telas normais */
  variant?: "solid" | "floating";
  /** Esconde o botão Voltar (ex: tela raiz logada) */
  hideBack?: boolean;
  /** Sobrescreve o destino do botão Sair (default: "/") */
  logoutRedirect?: string;
  /** Sobrescreve o destino do botão Home. */
  homePath?: string;
}

/**
 * Cabeçalho padrão de telas autenticadas APOIS.
 * Mantém sempre uma saída visível: Voltar, Home e Sair.
 */
export function MovviHeader({
  variant = "solid",
  hideBack = false,
  logoutRedirect = "/",
  homePath = "/motorista/app",
}: MovviHeaderProps) {
  const router = useRouter();
  const navigate = useNavigate();
  const [name, setName] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
      const fullName = (meta.full_name as string) || (meta.name as string) || "";
      setName(fullName || u.email?.split("@")[0] || "Usuário");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user;
      if (!u) {
        setName("");
        return;
      }
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
      const fullName = (meta.full_name as string) || (meta.name as string) || "";
      setName(fullName || u.email?.split("@")[0] || "Usuário");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: logoutRedirect });
  }

  function handleBack() {
    if (window.history.length > 1) router.history.back();
    else navigate({ to: homePath as "/motorista/app" });
  }

  const isFloating = variant === "floating";

  return (
    <header
      className={
        isFloating
          ? "absolute inset-x-0 top-0 z-30 px-3 pt-[calc(env(safe-area-inset-top)+12px)]"
          : "sticky top-0 z-30 border-b border-white/5 bg-[#08090A]/92 backdrop-blur-xl"
      }
      style={
        isFloating
          ? undefined
          : { boxShadow: "inset 0 -1px 0 0 rgba(246,190,28,0.10)" }
      }
    >
      <div
        className={
          isFloating
            ? "mx-auto flex max-w-5xl items-center gap-2 rounded-[20px] bg-[#0D0F11]/82 px-2.5 py-2 shadow-[0_16px_40px_-22px_rgba(0,0,0,0.75)] ring-1 ring-white/8 backdrop-blur-xl"
            : "mx-auto flex h-14 max-w-5xl items-center gap-2 px-3"
        }
      >
        {!hideBack && (
          <button
            type="button"
            onClick={handleBack}
            aria-label="Voltar"
            className="active-press inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-300 transition hover:bg-white/5 hover:text-white"
          >
            <ArrowLeft className="h-[17px] w-[17px]" strokeWidth={1.8} />
          </button>
        )}

        <Link
          to={homePath as "/motorista/app"}
          aria-label="Início APOIS Motorista"
          className="active-press flex shrink-0 items-center rounded-full transition hover:opacity-90"
        >
          <img
            src={APOIS_LOGO_DATA_URL}
            alt="APOIS"
            width={34}
            height={34}
            className="h-[34px] w-[34px] rounded-full border border-[#F6BE1C]/20 object-cover"
            draggable={false}
          />
        </Link>

        <div className="min-w-0 flex-1 pl-1.5">
          <span className="block text-[9px] font-black uppercase tracking-[0.16em] text-[#F6BE1C]">
            APOIS Motorista
          </span>
          {name && (
            <span className="mt-0.5 block truncate text-[12px] font-semibold leading-tight text-zinc-300" title={name}>
              {name}
            </span>
          )}
        </div>

        <Link
          to={homePath as "/motorista/app"}
          aria-label="Voltar ao mapa"
          className="active-press inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/5 hover:text-[#F6BE1C]"
        >
          <Home className="h-[17px] w-[17px]" strokeWidth={1.75} />
        </Link>

        <button
          type="button"
          onClick={handleLogout}
          aria-label="Sair"
          className="active-press inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-red-500/10 hover:text-red-400"
        >
          <LogOut className="h-[15px] w-[15px]" strokeWidth={1.7} />
        </button>
      </div>
    </header>
  );
}
