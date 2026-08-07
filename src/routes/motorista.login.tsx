import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/lib/supabaseClient";
import { loadDriverProfile } from "@/lib/driverProfile";
import { AuthShell } from "@/components/AuthShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import { DSButton, DSInput, DSLabel } from "@/design-system";

export const Route = createFileRoute("/motorista/login")({
  head: () => ({ meta: [{ title: "Entrar — APOIS Motorista" }, { name: "robots", content: "noindex" }] }),
  component: DriverLoginPage,
});

const schema = z.object({
  email: z.string().trim().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});

const LOGIN_TIMEOUT_MS = 20_000;

class NetworkTimeoutError extends Error {
  constructor(msg = "Sem resposta do servidor. Verifique sua conexão.") {
    super(msg);
    this.name = "NetworkTimeoutError";
  }
}

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

function isNetworkFailure(err: unknown): boolean {
  if (err instanceof NetworkTimeoutError) return true;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /network|fetch failed|failed to fetch|load failed|timeout|timed out|abort/i.test(msg);
}

function DriverLoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);
  const navigated = useRef(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current || loading) return;
    inFlight.current = true;
    setError(null);
    setLoading(true);

    try {
      let parsed: { email: string; password: string };
      try {
        parsed = schema.parse(Object.fromEntries(new FormData(e.currentTarget).entries()));
      } catch (zerr) {
        const first = zerr instanceof z.ZodError ? zerr.issues[0]?.message : null;
        setError(first ?? "Preencha os campos corretamente.");
        return;
      }

      let signInResult: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>;
      try {
        signInResult = await withTimeout(supabase.auth.signInWithPassword(parsed), LOGIN_TIMEOUT_MS);
      } catch (err) {
        setError(
          isNetworkFailure(err)
            ? "Falha de conexão. Verifique sua internet e tente novamente."
            : "Não foi possível entrar agora. Tente novamente.",
        );
        return;
      }

      const { data, error: authError } = signInResult;
      if (authError) {
        setError(
          isNetworkFailure(authError)
            ? "Falha de conexão. Verifique sua internet e tente novamente."
            : "E-mail ou senha inválidos.",
        );
        return;
      }
      if (!data?.session || !data?.user) {
        setError("Não foi possível iniciar a sessão. Tente novamente.");
        return;
      }

      const profileResult = await withTimeout(loadDriverProfile(), 10_000).catch((err) => {
        throw err;
      });
      if (!profileResult.ok) {
        if (profileResult.reason === "not_found") {
          setError("Cadastro de motorista não encontrado. Use a opção de cadastro para concluir seu perfil.");
        } else if (profileResult.reason === "no_session") {
          setError("Sessão não confirmada. Tente novamente.");
        } else {
          setError(profileResult.message || "Falha ao consultar cadastro de motorista.");
        }
        return;
      }

      const confirmed = await withTimeout(supabase.auth.getSession(), 5_000);
      if (!confirmed.data.session) {
        setError("Sessão não confirmada. Tente novamente.");
        return;
      }

      if (navigated.current) return;
      navigated.current = true;
      if (profileResult.profile.approval_status === "aprovado") {
        navigate({ to: "/motorista/app", replace: true });
      } else {
        navigate({ to: "/motorista/status", replace: true });
      }
    } catch (err) {
      console.error("[apois.motorista.login] erro:", err);
      setError(
        isNetworkFailure(err)
          ? "Falha de conexão ao consultar cadastro. Tente novamente."
          : "Erro inesperado. Tente novamente.",
      );
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }

  return (
    <AuthShell
      title="Entrar como motorista"
      description="Acesse sua conta APOIS para começar a rodar."
      footer={
        <>
          Quer dirigir conosco?{" "}
          <Link to="/motorista/cadastro" className="text-primary hover:underline">
            Cadastrar motorista
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <DSLabel htmlFor="email" className="text-[13px]">E-mail</DSLabel>
          <DSInput id="email" name="email" type="email" required autoComplete="email" className="h-9 text-[14px]" />
        </div>
        <div className="space-y-1.5">
          <DSLabel htmlFor="password" className="text-[13px]">Senha</DSLabel>
          <DSInput id="password" name="password" type="password" required autoComplete="current-password" className="h-9 text-[14px]" />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DSButton type="submit" size="sm" className="h-10 w-full" disabled={loading} aria-busy={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Entrar
        </DSButton>
      </form>
    </AuthShell>
  );
}
