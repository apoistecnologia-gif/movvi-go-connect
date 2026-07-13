import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/lib/supabaseClient";
import { AuthShell } from "@/components/AuthShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import { DSButton, DSLabel } from "@/design-system";

export const Route = createFileRoute("/passageiro/login")({
  head: () => ({ meta: [{ title: "Entrar — Passageiro MOVVI DRIVE" }, { name: "robots", content: "noindex" }] }),
  component: PassengerLoginPage,
});

const schema = z.object({
  email: z.string().trim().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});

const LOGIN_TIMEOUT_MS = 20_000;

/** Erro sentinela para distinguir timeout/rede de credenciais inválidas. */
class NetworkTimeoutError extends Error {
  constructor(msg = "Sem resposta do servidor. Verifique sua conexão.") {
    super(msg);
    this.name = "NetworkTimeoutError";
  }
}

/** Promise.race com timeout duro; libera o timer no finally. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  return new Promise<T>((resolve, reject) => {
    t = setTimeout(() => reject(new NetworkTimeoutError()), ms);
    p.then(
      (v) => {
        if (t) clearTimeout(t);
        resolve(v);
      },
      (e) => {
        if (t) clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Heurística: identifica falhas de rede (fetch/AbortError/offline) versus auth. */
function isNetworkFailure(err: unknown): boolean {
  if (err instanceof NetworkTimeoutError) return true;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /network|fetch failed|failed to fetch|load failed|timeout|timed out|abort/i.test(msg);
}

function PassengerLoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Refs impedem submissões e navegações duplicadas mesmo se o React re-renderizar
  // entre o clique e o setState (double-tap em WebView Android é comum).
  const inFlight = useRef(false);
  const navigated = useRef(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current || loading) return;
    inFlight.current = true;
    setError(null);
    setLoading(true);

    try {
      // 1) Valida entrada localmente antes de tocar em rede.
      let parsed: { email: string; password: string };
      try {
        parsed = schema.parse(Object.fromEntries(new FormData(e.currentTarget).entries()));
      } catch (zerr) {
        const first =
          zerr instanceof z.ZodError ? zerr.issues[0]?.message : null;
        setError(first ?? "Preencha os campos corretamente.");
        return;
      }

      // 2) signIn com timeout duro de 20s.
      let signInResult: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>;
      try {
        signInResult = await withTimeout(
          supabase.auth.signInWithPassword(parsed),
          LOGIN_TIMEOUT_MS,
        );
      } catch (err) {
        // Só cai aqui em timeout/rede — signInWithPassword não rejeita para creds inválidas.
        console.warn("[passageiro.login] network/timeout:", (err as Error)?.message);
        setError(
          isNetworkFailure(err)
            ? "Falha de conexão. Verifique sua internet e tente novamente."
            : "Não foi possível entrar agora. Tente novamente.",
        );
        return;
      }

      const { data, error: authError } = signInResult;

      // 3) Erro de credenciais retorna via `error` — mensagem específica.
      if (authError) {
        if (isNetworkFailure(authError)) {
          setError("Falha de conexão. Verifique sua internet e tente novamente.");
        } else {
          setError("E-mail ou senha inválidos.");
        }
        return;
      }

      // 4) Sessão E usuário precisam existir.
      if (!data?.session || !data?.user) {
        setError("Não foi possível iniciar a sessão. Tente novamente.");
        return;
      }

      // 5) Confirma que o storage já persistiu a sessão antes de navegar.
      let confirmed: Awaited<ReturnType<typeof supabase.auth.getSession>>;
      try {
        confirmed = await withTimeout(supabase.auth.getSession(), 5_000);
      } catch {
        setError("Sessão não confirmada. Tente novamente.");
        return;
      }
      if (!confirmed.data.session) {
        setError("Sessão não confirmada. Tente novamente.");
        return;
      }

      // 6) Navega uma única vez, sem histórico (impede voltar para o login).
      if (navigated.current) return;
      navigated.current = true;
      navigate({ to: "/passageiro/app", replace: true });
    } catch (err) {
      console.error("[passageiro.login] erro inesperado:", err);
      setError("Erro inesperado. Tente novamente.");
    } finally {
      // Loading SEMPRE liberado, mesmo em early-return.
      setLoading(false);
      inFlight.current = false;
    }
  }

  return (
    <AuthShell
      title="Entrar como passageiro"
      description="Acesse sua conta para solicitar uma corrida."
      footer={
        <>
          Não tem conta?{" "}
          <Link to="/passageiro/cadastro" className="text-primary hover:underline">
            Cadastre-se
          </Link>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          console.log("[login.form] submit");
          void onSubmit(e);
        }}
        className="space-y-3"
      >
        <div className="space-y-1.5">
          <DSLabel htmlFor="email" className="text-[13px]">E-mail</DSLabel>
          <input
            id="email"
            name="email"
            type="text"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            data-lpignore="true"
            data-form-type="other"
            enterKeyHint="next"
            required
            onFocus={() => console.log("[login.input] email focus")}
            onInput={() => console.log("[login.input] email input")}
            className="flex h-9 w-full rounded-lg border border-input/70 bg-transparent px-3.5 py-1.5 text-[14px] shadow-sm caret-primary placeholder:text-muted-foreground/75 focus-visible:outline-none focus-visible:border-primary/70 focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <div className="space-y-1.5">
          <DSLabel htmlFor="password" className="text-[13px]">Senha</DSLabel>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            data-lpignore="true"
            data-form-type="other"
            enterKeyHint="done"
            required
            onFocus={() => console.log("[login.input] password focus")}
            className="flex h-9 w-full rounded-lg border border-input/70 bg-transparent px-3.5 py-1.5 text-[14px] shadow-sm caret-primary placeholder:text-muted-foreground/75 focus-visible:outline-none focus-visible:border-primary/70 focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DSButton
          type="submit"
          size="sm"
          className="w-full h-10"
          disabled={loading}
          aria-busy={loading}
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Entrar
        </DSButton>
      </form>
    </AuthShell>
  );
}
