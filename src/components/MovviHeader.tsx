import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Home, Loader2, LogOut } from "lucide-react";
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

function displayNameFromUser(user: { email?: string | null; user_metadata?: unknown } | null | undefined) {
  if (!user) return "";
  const meta = user.user_metadata && typeof user.user_metadata === "object"
    ? (user.user_metadata as Record<string, unknown>)
    : {};
  const fullName = typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  const name = typeof meta.name === "string" ? meta.name.trim() : "";
  const emailName = typeof user.email === "string" ? user.email.split("@")[0]?.trim() : "";
  return (fullName || name || emailName || "Motorista").slice(0, 80);
}

/** Cabeçalho padrão de telas autenticadas APOIS. */
export function MovviHeader({
  variant = "solid",
  hideBack = false,
  logoutRedirect = "/",
  homePath = "/motorista/app",
}: MovviHeaderProps) {
  const router = useRouter();
  const navigate = useNavigate();
  const mountedRef = useRef(true);
  const [name, setName] = useState<string>("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    void supabase.auth.getUser().then(({ data, error }) => {
      if (cancelled || !mountedRef.current) return;
      if (error) {
        if (import.meta.env.DEV) console.warn("[APOIS HEADER] falha ao carregar usuário", error);
        setName("");
        return;
      }
      setName(displayNameFromUser(data.user));
    }).catch((error) => {
      if (!cancelled && mountedRef.current && import.meta.env.DEV) {
        console.warn("[APOIS HEADER] falha inesperada ao carregar usuário", error);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled || !mountedRef.current) return;
      setName(displayNameFromUser(session?.user));
      if (session?.user) setLogoutError(null);
    });

    return () => {
      cancelled = true;
      mountedRef.current = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleLogout() {
    if (loggingOut) return;
    setLogoutError(null);
    setLoggingOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      await navigate({ to: logoutRedirect as "/", replace: true });
    } catch (error) {
      if (import.meta.env.DEV) console.warn("[APOIS HEADER] falha ao sair", error);
      if (mountedRef.current) setLogoutError("Não foi possível sair agora. Tente novamente.");
    } finally {
      if (mountedRef.current) setLoggingOut(false);
    }
  }

  function handleBack() {
    if (window.history.length > 1) router.history.back();
    else void navigate({ to: homePath as "/motorista/app", replace: true });
  }

  const isFloating = variant === "floating";
  const buttonClass = "active-press inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F6BE1C] focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090A]";

  return (
    <header
      className={
        isFloating
          ? "absolute inset-x-0 top-0 z-30 min-w-0 px-[max(12px,env(safe-area-inset-left))] pt-[calc(env(safe-area-inset-top)+12px)] [padding-right:max(12px,env(safe-area-inset-right))]"
          : "sticky top-0 z-30 min-w-0 border-b border-white/5 bg-[#08090A]/92 pt-[env(safe-area-inset-top)] backdrop-blur-xl"
      }
      style={isFloating ? undefined : { boxShadow: "inset 0 -1px 0 0 rgba(246,190,28,0.10)" }}
    >
      <div
        className={
          isFloating
            ? "mx-auto flex min-w-0 max-w-5xl items-center gap-1.5 rounded-[20px] bg-[#0D0F11]/82 px-2 py-2 shadow-[0_16px_40px_-22px_rgba(0,0,0,0.75)] ring-1 ring-white/8 backdrop-blur-xl"
            : "mx-auto flex min-h-14 min-w-0 max-w-5xl items-center gap-1.5 px-[max(12px,env(safe-area-inset-left))] py-1 [padding-right:max(12px,env(safe-area-inset-right))]"
        }
      >
        {!hideBack && (
          <button
            type="button"
            onClick={handleBack}
            aria-label="Voltar"
            disabled={loggingOut}
            className={`${buttonClass} text-zinc-300 hover:bg-white/5 hover:text-white disabled:opacity-50`}
          >
            <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
          </button>
        )}

        <Link
          to={homePath as "/motorista/app"}
          aria-label="Ir para o início do APOIS Motorista"
          className={`${buttonClass} p-1 transition hover:opacity-90`}
        >
          <img
            src={APOIS_LOGO_DATA_URL}
            alt=""
            width={34}
            height={34}
            className="h-[34px] w-[34px] rounded-full border border-[#F6BE1C]/20 object-cover"
            draggable={false}
          />
        </Link>

        <div className="min-w-0 flex-1 pl-1">
          <span className="block break-words text-[11px] font-black uppercase leading-tight tracking-[0.12em] text-[#F6BE1C]">
            APOIS Motorista
          </span>
          {name ? (
            <span className="mt-0.5 block break-words text-[13px] font-semibold leading-4 text-zinc-300">
              {name}
            </span>
          ) : (
            <span className="sr-only">Conta do motorista</span>
          )}
        </div>

        <Link
          to={homePath as "/motorista/app"}
          aria-label="Voltar ao mapa"
          className={`${buttonClass} text-zinc-400 hover:bg-white/5 hover:text-[#F6BE1C]`}
        >
          <Home className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
        </Link>

        <button
          type="button"
          onClick={() => void handleLogout()}
          aria-label={loggingOut ? "Saindo do aplicativo" : "Sair do aplicativo"}
          aria-busy={loggingOut}
          disabled={loggingOut}
          className={`${buttonClass} text-zinc-400 hover:bg-red-500/10 hover:text-red-400 disabled:cursor-wait disabled:opacity-60`}
        >
          {loggingOut
            ? <Loader2 className="h-[17px] w-[17px] animate-spin motion-reduce:animate-none" aria-hidden="true" />
            : <LogOut className="h-[17px] w-[17px]" strokeWidth={1.7} aria-hidden="true" />}
        </button>
      </div>

      {logoutError ? (
        <div className="mx-auto max-w-5xl px-3 pb-2" role="alert" aria-live="assertive">
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-center text-[12px] font-medium leading-4 text-red-300 ring-1 ring-red-500/20">
            {logoutError}
          </p>
        </div>
      ) : null}
    </header>
  );
}
