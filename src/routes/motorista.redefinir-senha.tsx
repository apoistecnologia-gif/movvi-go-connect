import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { MovviLogo } from "@/components/MovviLogo";
import { supabase } from "@/lib/supabaseClient";

export const Route = createFileRoute("/motorista/redefinir-senha")({
  head: () => ({
    meta: [
      { title: "Nova senha — APOIS Motorista" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DriverPasswordResetPage,
});

function DriverPasswordResetPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionState, setSessionState] = useState<"checking" | "valid" | "invalid">("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!alive) return;
      setSessionState(!sessionError && data.session ? "valid" : "invalid");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (event === "PASSWORD_RECOVERY" || session) setSessionState("valid");
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError(null);

    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError("Use pelo menos 8 caracteres, com letras e números.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        const message = updateError.message.toLowerCase();
        if (message.includes("session") || message.includes("expired")) {
          setSessionState("invalid");
          setError("O link expirou. Solicite uma nova recuperação.");
        } else if (message.includes("same password")) {
          setError("A nova senha precisa ser diferente da senha anterior.");
        } else {
          setError("Não foi possível atualizar a senha agora.");
        }
        return;
      }
      await navigate({ to: "/motorista/app", replace: true });
    } catch (caughtError) {
      console.warn("[apois.motorista.recovery] password update failed", {
        message: caughtError instanceof Error ? caughtError.message : "unknown_error",
      });
      setError("Falha de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  if (sessionState === "checking") {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#050607] px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+24px)] text-white">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#F6BE1C]" />
          <p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
            Validando link seguro
          </p>
        </div>
      </main>
    );
  }

  if (sessionState === "invalid") {
    return (
      <main className="min-h-[100dvh] bg-[#050607] px-5 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-[calc(env(safe-area-inset-top)+28px)] text-white">
        <div className="mx-auto w-full max-w-md text-center">
          <MovviLogo size={64} productLabel="MOTORISTA" />
          <section className="mt-8 rounded-[28px] border border-red-400/20 bg-[#0D0F11] p-6">
            <AlertTriangle className="mx-auto h-10 w-10 text-red-400" />
            <h1 className="mt-5 text-2xl font-black">Link inválido ou expirado</h1>
            <p className="mt-3 text-sm leading-6 text-zinc-500">
              Por segurança, solicite um novo link para redefinir sua senha.
            </p>
            <Link
              to="/motorista/recuperar-senha"
              className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#F6BE1C] px-5 text-sm font-black text-black"
            >
              Solicitar novo link
            </Link>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[#050607] px-5 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-[calc(env(safe-area-inset-top)+24px)] text-white">
      <div className="mx-auto w-full max-w-md">
        <div className="flex items-center justify-between">
          <Link
            to="/motorista/login"
            aria-label="Voltar para o login"
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/8 bg-[#111315] text-zinc-300"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <MovviLogo size={58} productLabel="MOTORISTA" />
          <div className="h-11 w-11" aria-hidden="true" />
        </div>

        <section className="mt-8 rounded-[28px] border border-white/7 bg-[#0D0F11] p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#F6BE1C]">Link confirmado</p>
          <h1 className="mt-2 text-2xl font-black">Crie uma nova senha</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500">Use pelo menos 8 caracteres, com letras e números.</p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <label className="block">
              <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Nova senha</span>
              <div className="flex h-14 items-center gap-3 rounded-2xl border border-white/8 bg-black/30 px-4 focus-within:border-[#F6BE1C]/60">
                <LockKeyhole className="h-5 w-5 text-[#F6BE1C]" />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="flex h-11 w-11 items-center justify-center text-zinc-500"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Confirmar senha</span>
              <div className="flex h-14 items-center gap-3 rounded-2xl border border-white/8 bg-black/30 px-4 focus-within:border-[#F6BE1C]/60">
                <LockKeyhole className="h-5 w-5 text-[#F6BE1C]" />
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                />
              </div>
            </label>

            {error ? (
              <div className="flex items-start gap-2 rounded-2xl border border-red-400/20 bg-red-400/8 p-3 text-xs font-semibold text-red-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#F6BE1C] px-5 text-sm font-black text-black disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loading ? "Salvando..." : "Salvar nova senha"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
