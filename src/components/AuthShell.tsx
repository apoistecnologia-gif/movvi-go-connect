import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Home } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MovviLogo } from "@/components/MovviLogo";
import { translateAuthError } from "@/lib/authErrors";

interface AuthShellProps {
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthShell({ title, description, children, footer }: AuthShellProps) {
  const router = useRouter();
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen flex-col bg-background px-4 py-6">
      <div className="mx-auto flex w-full max-w-md items-center justify-between">
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

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center space-y-6">
        <Link to="/" className="flex justify-center">
          <MovviLogo size={56} />
        </Link>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
        {footer && <div className="text-center text-sm text-muted-foreground">{footer}</div>}
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

export function useAuthForm(): UseAuthFormResult {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const handle =
    (fn: (form: FormData) => Promise<void>) => async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);
      setLoading(true);
      try {
        await fn(new FormData(e.currentTarget));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro inesperado");
      } finally {
        setLoading(false);
      }
    };
  return { error, setError, loading, handle };
}
