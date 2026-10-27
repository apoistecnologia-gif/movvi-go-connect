import { Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { useEffect } from "react";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { reportLovableError } from "@/lib/lovable-error-reporting";

/**
 * Router-wide fallback UIs.
 *
 * Wired in `getRouter()` via `defaultErrorComponent` and
 * `defaultNotFoundComponent`. Any route that doesn't declare its own
 * `errorComponent` / `notFoundComponent` falls back to these — no route
 * ever renders a blank screen on a thrown error or unmatched deep path.
 */

export function DefaultErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter();

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
    reportLovableError(error, { boundary: "tanstack_default_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/15 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Algo deu errado
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Não conseguimos carregar esta página. Tente novamente em instantes.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-glow"
          >
            <RotateCcw className="h-4 w-4" />
            Tentar novamente
          </button>
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-2"
          >
            <Home className="h-4 w-4" />
            Início
          </Link>
        </div>
      </div>
    </div>
  );
}

export function DefaultNotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-display font-bold text-primary">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          Página não encontrada
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O endereço solicitado não existe na plataforma APOIS.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-glow"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}
