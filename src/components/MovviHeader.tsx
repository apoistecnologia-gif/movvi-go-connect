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
          ? "absolute inset-x-0 top-0 z-30 px-3 pt-3"
          : "sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-md"
      }
    >
      <div
        className={
          isFloating
            ? "mx-auto flex max-w-5xl items-center gap-1.5 rounded-2xl bg-card/85 px-2 py-1.5 shadow-lg ring-1 ring-border/70 backdrop-blur-xl"
            : "mx-auto flex h-12 max-w-5xl items-center gap-1.5 px-3"
        }
      >
        {!hideBack && (
          <button
            type="button"
            onClick={handleBack}
            aria-label="Voltar"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground transition hover:bg-accent/40 active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}

        <Link
          to="/"
          aria-label="Home MOVVI"
          className="flex shrink-0 items-center gap-1.5 rounded-full px-1.5 py-1 transition hover:bg-accent/40"
        >
          <MovviHeaderLogo />
        </Link>

        <div className="min-w-0 flex-1 px-1">
          {name && (
            <span className="block truncate text-[13px] font-semibold leading-tight text-foreground" title={name}>
              {name}
            </span>
          )}
        </div>

        <Link
          to="/"
          aria-label="Home"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground transition hover:bg-accent/40 active:scale-95"
        >
          <Home className="h-4 w-4" />
        </Link>

        <button
          type="button"
          onClick={handleLogout}
          aria-label="Sair"
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-destructive/15 px-2.5 text-xs font-medium text-destructive ring-1 ring-destructive/30 transition hover:bg-destructive/25 active:scale-95"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Sair</span>
        </button>
      </div>
    </header>
  );
}

function MovviHeaderLogo() {
  return (
    <svg width={22} height={22} viewBox="0 0 120 120" aria-hidden>
      <path d="M18 100 L18 28 L40 28 L60 70 L60 100 Z" fill="white" />
      <path
        d="M60 28 Q100 28 100 64 Q100 100 60 100 L60 78 Q82 78 82 64 Q82 50 60 50 Z"
        fill="hsl(95 75% 51%)"
      />
    </svg>
  );
}
