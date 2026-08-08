import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Home } from "lucide-react";
import { MovviLogo } from "@/components/MovviLogo";
import { translateAuthError } from "@/lib/authErrors";
import { DSCard, DSCardContent, DSCardDescription, DSCardHeader, DSCardTitle } from "@/design-system";
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
  // No APK (Capacitor) ou em builds de aplicativo (passageiro/motorista) não
  // renderizamos chrome de navegação web ("Voltar"/"Início"): a experiência
  // precisa ser nativa.
  const hideWebChrome = isNative() || isPassengerBuild() || isDriverBuild();

  return (
    <div
      className="min-h-dvh w-full overflow-y-auto bg-background"
      style={{ overscrollBehaviorY: "contain" }}
    >
      <div className="mx-auto flex w-full max-w-md flex-col px-4 pb-10 pt-6 md:min-h-dvh md:justify-center">
        {!hideWebChrome && (
          <div className="mb-4 flex w-full items-center justify-between">
            <button
              type="button"
              onClick={() => (window.history.length > 1 ? router.history.back() : navigate({ to: "/" }))}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-accent/40 hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
            </button>
            <Link
              to="/"
              aria-label="Home"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-accent/40 hover:text-foreground"
            >
              <Home className="h-4 w-4" /> Início
            </Link>
          </div>
        )}

        <div className="flex w-full flex-col space-y-6">
          <div className="flex justify-center">
            <MovviLogo size={56} productLabel={brandLabel} />
          </div>
          <DSCard>
            <DSCardHeader>
              <DSCardTitle className="text-2xl">{title}</DSCardTitle>
              <DSCardDescription>{description}</DSCardDescription>
            </DSCardHeader>
            <DSCardContent>{children}</DSCardContent>
          </DSCard>
          {footer && <div className="text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

interface UseAuthFormResult {
  error: string | null;
  setError: (s: string | null) => void;
  loading: boolean;
  handle: (fn: (form: FormData) => Promise<void>) => (e: FormEvent<HTMLFormElement>) => Promise<void>;
}

/** Timeout duro para qualquer promise — evita botão preso em "carregando". */
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T>([
      p,
      new Promise<T>((_, reject) => {
        t = setTimeout(
          () => reject(new Error(`${label}: sem resposta do servidor. Verifique sua conexão.`)),
          ms,
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
  const handle =
    (fn: (form: FormData) => Promise<void>) => async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (loading) return; // ignora cliques duplicados
      setError(null);
      setLoading(true);
      try {
        // 20s é generoso o suficiente para redes 3G ruins e ainda garante que
        // o botão nunca fique preso indefinidamente.
        await withTimeout(fn(new FormData(e.currentTarget)), 20_000, "Login");
      } catch (err) {
        console.warn("[auth-form] erro:", (err as Error)?.message);
        setError(translateAuthError(err));
      } finally {
        setLoading(false);
      }
    };
  return { error, setError, loading, handle };
}
