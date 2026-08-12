import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { z } from "zod";
import {
  AlertTriangle,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
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

const DriverRecoveryLink = Link as unknown as (props: {
  to: "/motorista/recuperar-senha";
  className?: string;
  children: React.ReactNode;
}) => React.ReactElement;

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
  const [showPassword, setShowPassword] = useState(false);
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
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#020304] text-white">
      {/* Fundo exclusivamente visual: preto, grafite e brilho dourado APOIS. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 18%, rgba(246,190,28,0.17) 0%, rgba(246,190,28,0.045) 21%, transparent 43%), radial-gradient(circle at 92% 33%, rgba(246,190,28,0.055), transparent 31%), linear-gradient(180deg,#090b0d 0%,#030405 58%,#000 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[21vh] h-[42vh] opacity-40"
        style={{
          background:
            "linear-gradient(112deg, transparent 0 36%, rgba(246,190,28,.08) 36.2% 36.55%, transparent 36.8% 100%), linear-gradient(68deg, transparent 0 61%, rgba(255,255,255,.025) 61.2% 61.45%, transparent 61.7% 100%)",
        }}
      />

      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+22px)] pt-[calc(env(safe-area-inset-top)+16px)]">
        <header className="flex justify-center pt-2">
          <div className="rounded-full bg-black/20 p-1 drop-shadow-[0_14px_30px_rgba(246,190,28,.14)]">
            <MovviLogo size={122} showTagline productLabel="" />
          </div>
        </header>

        <section className="mt-5">
          <h1 className="text-[32px] font-black leading-[1.08] tracking-[-0.04em]">
            Bem-vindo(a) à<br />
            <span className="text-[#F6BE1C]">APOIS</span> Motorista
          </h1>
          <p className="mt-3 text-[13px] font-medium leading-5 text-zinc-400">
            Faça login para começar a receber corridas.
          </p>
        </section>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.12em] text-zinc-400">
              E-mail
            </span>
            <div className="flex h-[58px] items-center gap-3 rounded-[17px] border border-white/[0.13] bg-[#0D0F11]/95 px-4 shadow-[inset_0_1px_0_rgba(255,255,255,.025),0_12px_36px_-28px_rgba(0,0,0,.95)] transition focus-within:border-[#F6BE1C]/60 focus-within:ring-1 focus-within:ring-[#F6BE1C]/20">
              <Mail className="h-[20px] w-[20px] shrink-0 text-[#F6BE1C]" strokeWidth={1.9} />
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                placeholder="Digite seu e-mail"
                className="h-full min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-white outline-none placeholder:text-zinc-600"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.12em] text-zinc-400">
              Senha
            </span>
            <div className="flex h-[58px] items-center gap-3 rounded-[17px] border border-white/[0.13] bg-[#0D0F11]/95 px-4 shadow-[inset_0_1px_0_rgba(255,255,255,.025),0_12px_36px_-28px_rgba(0,0,0,.95)] transition focus-within:border-[#F6BE1C]/60 focus-within:ring-1 focus-within:ring-[#F6BE1C]/20">
              <LockKeyhole className="h-[20px] w-[20px] shrink-0 text-[#F6BE1C]" strokeWidth={1.9} />
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                placeholder="Digite sua senha"
                className="h-full min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-white outline-none placeholder:text-zinc-600"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-zinc-500 transition active:scale-95 hover:bg-white/5 hover:text-white"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </label>

          <div className="flex justify-end">
            <DriverRecoveryLink
              to="/motorista/recuperar-senha"
              className="min-h-11 px-1 py-2 text-[12px] font-black text-[#F6BE1C]"
            >
              Esqueci minha senha
            </DriverRecoveryLink>
          </div>

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
            className="press-scale flex h-[58px] w-full items-center justify-center gap-2 rounded-[17px] border border-[#FFD24A]/35 bg-[#F6BE1C] text-[16px] font-black text-black shadow-[0_20px_46px_-24px_rgba(246,190,28,0.78)] transition hover:brightness-105 active:scale-[0.99] disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            {loading ? "Entrando..." : "Entrar"}
            {!loading ? <ChevronRight className="h-5 w-5" strokeWidth={2.7} /> : null}
          </button>
        </form>

        <div className="mt-5 text-center">
          <p className="text-[12px] font-semibold text-zinc-500">Ainda não tem uma conta?</p>
          <Link
            to="/motorista/cadastro"
            className="mt-1 inline-flex min-h-10 items-center justify-center gap-1.5 px-3 text-[13px] font-black text-[#F6BE1C]"
          >
            Cadastrar como motorista
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-[20px] border border-white/[0.085] bg-[#0B0D0F]/96 px-4 py-3.5 shadow-[0_18px_44px_-28px_rgba(0,0,0,.95)]">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-[#F6BE1C]/30 bg-[#F6BE1C]/8">
            <ShieldCheck className="h-6 w-6 text-[#F6BE1C]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-black text-white">Sua segurança é prioridade</p>
            <p className="mt-1 text-[10.5px] font-medium leading-relaxed text-zinc-500">
              PIN no embarque e recursos de segurança durante a corrida.
            </p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-zinc-600" />
        </div>
      </div>
    </main>
  );
}
