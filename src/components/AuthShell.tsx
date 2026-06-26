import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MovviLogo } from "@/components/MovviLogo";

interface AuthShellProps {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthShell({ title, description, children, footer }: AuthShellProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
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
