import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Home } from "lucide-react";
import { MovviLogo } from "@/components/MovviLogo";
import { translateAuthError } from "@/lib/authErrors";
import {
  DSCard,
  DSCardContent,
  DSCardDescription,
  DSCardHeader,
  DSCardTitle,
} from "@/design-system";
import { isNative } from "@/lib/nativeBridge";
import { isPassengerBuild, isDriverBuild } from "@/lib/appRole";

interface AuthShellProps {
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  brandLabel?: string;
}

export function AuthShell({ title, description, children, footer, brandLabel }: AuthShellProps) {
  const router = useRouter();
  const navigate = useNavigate();
  const hideWebChrome = isNative() || isPassengerBuild() || isDriverBuild();

  return (
    <div className="min-h-[100dvh] w-full min-w-0 overflow-y-auto overscroll-y-contain bg-background">
      <div
        className="mx-auto flex w-full min-w-0 max-w-md flex-col px-4 md:min-h-[100dvh] md:justify-center"
        style={{
          paddingTop: "max(24px, env(safe-area-inset-top))",
          paddingBottom: "max(40px, env(safe-area-inset-bottom))",
        }}
      >
        {!hideWebChrome && (
          <nav className="mb-4 flex w-full items-center justify-between gap-3" aria-label="Navegação de autenticação">
            <button
              type="button"
              onClick={() =>
                window.history.length > 1 ? router.history.back() : void navigate({ to: "/" })
              }
              aria-label="Voltar para a página anterior"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar
            </button>
            <Link
              to="/"
              aria-label="Ir para o início"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <Home className="h-4 w-4" aria-hidden="true" /> Início
            </Link>
          </nav>
        )}

        <main className="flex w-full min-w-0 flex-col space-y-6">
          <div className="flex justify-center" aria-hidden="true">
            <MovviLogo size={56} productLabel={brandLabel} />
          </div>
          <DSCard className="min-w-0 overflow-hidden">
            <DSCardHeader className="min-w-0">
              <DSCardTitle className="break-words text-2xl leading-tight">{title}</DSCardTitle>
              <DSCardDescription className="break-words text-sm leading-5">{description}</DSCardDescription>
            </DSCardHeader>
            <DSCardContent className="min-w-0">{children}</DSCardContent>
          </DSCard>
          {footer && <div className="min-w-0 break-words text-center text-sm leading-5 text-muted-foreground">{footer}</div>}
        </main>
      </div>
    </div>
  );
}

interface UseAuthFormResult {
  error: string | null;
  setError: (s: string | null) => void;
  loading: boolean;
  handle: (
    fn: (form: FormData) => Promise<void>,
  ) => (e: FormEvent<HTMLFormElement>) => Promise<void>;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  const safeMs = Number.isFinite(ms) ? Math.min(60_000, Math.max(1_000, ms)) : 20_000;
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T>([
      p,
      new Promise<T>((_, reject) => {
        t = setTimeout(
          () => reject(new Error("auth_request_timeout")),
          safeMs,
        );
      }),
    ]);
  } finally {
    if (t) clearTimeout(t);
  }
}

export function useAuthForm(): UseAuthFormResult {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);
  const submittingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handle =
    (fn: (form: FormData) => Promise<void>) => async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (submittingRef.current) return;
      submittingRef.current = true;
      if (mountedRef.current) {
        setError(null);
        setLoading(true);
      }
      try {
        await withTimeout(fn(new FormData(e.currentTarget)), 20_000);
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn("[auth-form] request failed", err instanceof Error ? err.message : "unknown_error");
        }
        if (mountedRef.current) {
          const translated = err instanceof Error && err.message === "auth_request_timeout"
            ? "A solicitação demorou demais. Verifique sua conexão e tente novamente."
            : translateAuthError(err);
          setError(translated || "Não foi possível concluir a solicitação. Tente novamente.");
        }
      } finally {
        submittingRef.current = false;
        if (mountedRef.current) setLoading(false);
      }
    };
  return { error, setError, loading, handle };
}
