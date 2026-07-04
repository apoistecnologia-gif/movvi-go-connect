import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Home, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface MovviHeaderProps {
  /** "floating" para overlay sobre mapas, "solid" para telas normais */
  variant?: "solid" | "floating";
  /** Esconde o botão Voltar (ex: tela raiz logada) */
  hideBack?: boolean;
  /** Sobrescreve o destino do botão Sair (default: "/") */
  logoutRedirect?: string;
}

/**
 * Cabeçalho padrão de TODA tela autenticada do MOVVI:
 * ← Voltar | Logo | Nome do usuário | Home | Sair
 *
 * Garante que nenhuma tela deixe o usuário preso.
 */
export function MovviHeader({
  variant = "solid",
  hideBack = false,
  logoutRedirect = "/",
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
    else navigate({ to: "/" });
  }

  const isFloating = variant === "floating";

  return (
    <header
      className={
        isFloating
          ? "absolute inset-x-0 top-0 z-30 px-3 pt-[calc(env(safe-area-inset-top)+12px)]"
          : "sticky top-0 z-30 border-b border-border/50 bg-background/85 backdrop-blur-xl"
      }
      style={
        isFloating
          ? undefined
          : {
              // Subtle MOVVI green accent under the solid header.
              boxShadow:
                "inset 0 -1px 0 0 color-mix(in oklab, var(--color-primary) 22%, transparent)",
            }
      }
    >
      <div
        className={
          isFloating
            ? "mx-auto flex max-w-5xl items-center gap-2 rounded-[20px] bg-card/75 px-2.5 py-2 shadow-[0_16px_40px_-22px_rgba(0,0,0,0.55)] ring-1 ring-border/35 backdrop-blur-xl"
            : "mx-auto flex h-14 max-w-5xl items-center gap-2 px-4"
        }
      >
        {!hideBack && (
          <button
            type="button"
            onClick={handleBack}
            aria-label="Voltar"
            className="active-press inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground/75 transition hover:bg-muted/40 hover:text-foreground"
          >
            <ArrowLeft className="h-[16px] w-[16px]" strokeWidth={1.75} />
          </button>
        )}

        <Link
          to="/"
          aria-label="Home MOVVI"
          className="active-press flex shrink-0 items-center rounded-full px-0.5 transition hover:opacity-90"
        >
          <MovviHeaderLogo />
        </Link>

        <div className="min-w-0 flex-1 pl-1.5">
          {name && (
            <span
              className="block truncate text-[13px] font-medium leading-tight tracking-tight text-foreground/90"
              title={name}
            >
              {name}
            </span>
          )}
        </div>

        <Link
          to="/"
          aria-label="Home"
          className="active-press inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition hover:bg-muted/40 hover:text-foreground"
        >
          <Home className="h-[16px] w-[16px]" strokeWidth={1.75} />
        </Link>

        <button
          type="button"
          onClick={handleLogout}
          aria-label="Sair"
          className="active-press inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground/45 transition hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-[14px] w-[14px]" strokeWidth={1.6} />
        </button>
      </div>
    </header>
  );
}

function MovviHeaderLogo() {
  return (
    <svg width={22} height={22} viewBox="0 0 120 120" aria-hidden>
      <path d="M18 100 L18 28 L40 28 L60 70 L60 100 Z" fill="currentColor" className="text-foreground" />
      <path
        d="M60 28 Q100 28 100 64 Q100 100 60 100 L60 78 Q82 78 82 64 Q82 50 60 50 Z"
        fill="hsl(95 75% 51%)"
      />
    </svg>
  );
}


