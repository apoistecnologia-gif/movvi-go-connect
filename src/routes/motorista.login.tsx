import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { z } from "zod";
import { AlertTriangle, ChevronRight, Loader2, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { loadDriverProfile } from "@/lib/driverProfile";
import { MovviLogo } from "@/components/MovviLogo";

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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => reject(new NetworkTimeoutError()), ms);
    promise.then(
      (value) => {
        if (timer) clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (timer) clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function isNetworkFailure(error: unknown): boolean {
  if (error instanceof NetworkTimeoutError) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /network|fetch failed|failed to fetch|load failed|timeout|timed out|abort/i.test(message);
}

function DriverLoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);
  const navigated = useRef(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || loading) return;
    inFlight.current = true;
    setError(null);
    setLoading(true);

    try {
      let parsed: { email: string; password: string };
      try {
        parsed = schema.parse(Object.fromEntries(new FormData(event.currentTarget).entries()));
      } catch (zerr) {
        const first = zerr instanceof z.ZodError ? zerr.issues[0]?.message : null;
        setError(first ?? "Preencha os campos corretamente.");
        return;
      }

      let signInResult: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>;
      try {
        signInResult = await withTimeout(supabase.auth.signInWithPassword(parsed), LOGIN_TIMEOUT_MS);
      } catch (caughtError) {
        setError(
          isNetworkFailure(caughtError)
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

      const profileResult = await withTimeout(loadDriverProfile(), 10_000);
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
    } catch (caughtError) {
      console.error("[apois.motorista.login] erro:", caughtError);
      setError(
        isNetworkFailure(caughtError)
          ? "Falha de conexão ao consultar cadastro. Tente novamente."
          : "Erro inesperado. Tente novamente.",
      );
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#050607] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[42vh]"
        style={{
          background:
            "radial-gradient(circle at 50% 28%, rgba(246,190,28,0.15) 0%, rgba(246,190,28,0.03) 34%, transparent 68%)",
        }}
      />

      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+22px)] pt-[calc(env(safe-area-inset-top)+26px)]">
        <header className="flex justify-center">
          <MovviLogo size={92} showTagline />
        </header>

        <section className="mt-7 text-center">
          <h1 className="text-[26px] font-black leading-tight tracking-tight">
            Bem-vindo(a) à <span className="text-[#F6BE1C]">APOIS</span>
          </h1>
          <p className="mt-2 text-[12.5px] font-medium text-zinc-500">
            Faça login para continuar sua jornada como motorista parceiro.
          </p>
        </section>

        <form onSubmit={onSubmit} className="mt-7 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
              E-mail
            </span>
            <div className="flex h-13 items-center gap-3 rounded-[16px] border border-white/8 bg-[#101214] px-4 focus-within:border-[#F6BE1C]/50">
              <Mail className="h-[17px] w-[17px] shrink-0 text-[#F6BE1C]" strokeWidth={1.9} />
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                placeholder="Digite seu e-mail"
                className="h-full min-w-0 flex-1 bg-transparent text-[13px] font-semibold text-white outline-none placeholder:text-zinc-700"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
              Senha
            </span>
            <div className="flex h-13 items-center gap-3 rounded-[16px] border border-white/8 bg-[#101214] px-4 focus-within:border-[#F6BE1C]/50">
              <LockKeyhole className="h-[17px] w-[17px] shrink-0 text-[#F6BE1C]" strokeWidth={1.9} />
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="Digite sua senha"
                className="h-full min-w-0 flex-1 bg-transparent text-[13px] font-semibold text-white outline-none placeholder:text-zinc-700"
              />
            </div>
          </label>

          {error ? (
            <div className="flex items-start gap-2 rounded-[16px] border border-red-400/20 bg-red-400/8 px-3.5 py-3 text-[11px] font-semibold leading-relaxed text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            aria-busy={loading}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-[#F6BE1C] text-[13px] font-black text-black shadow-[0_18px_38px_-24px_rgba(246,190,28,0.8)] transition active:scale-[0.99] disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "Entrando..." : "Entrar"}
            {!loading ? <ChevronRight className="h-4 w-4" /> : null}
          </button>
        </form>

        <div className="mt-5 flex items-start gap-3 rounded-[20px] border border-white/5 bg-[#0D0F11] px-4 py-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#F6BE1C]" />
          <div>
            <p className="text-[11px] font-black text-white">Sua segurança é nossa prioridade</p>
            <p className="mt-1 text-[10px] font-medium leading-relaxed text-zinc-600">
              Viagens protegidas, PIN no embarque e recursos de segurança durante a corrida.
            </p>
          </div>
        </div>

        <div className="mt-auto pt-7 text-center">
          <p className="text-[11px] font-semibold text-zinc-600">Ainda não tem uma conta?</p>
          <Link
            to="/motorista/cadastro"
            className="mt-2 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[16px] border border-[#F6BE1C]/25 px-5 text-[11px] font-black text-[#F6BE1C]"
          >
            Criar conta
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </main>
  );
}
