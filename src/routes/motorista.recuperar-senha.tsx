import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Mail } from "lucide-react";
import { z } from "zod";
import { MovviLogo } from "@/components/MovviLogo";
import { getDriverPasswordRecoveryRedirectTo } from "@/lib/auth/driverPasswordRecovery";
import { supabase } from "@/lib/supabaseClient";

export const Route = createFileRoute("/motorista/recuperar-senha")({
  head: () => ({
    meta: [
      { title: "Recuperar senha — APOIS Motorista" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DriverPasswordRecoveryPage,
});

const schema = z.object({ email: z.string().trim().email("Informe um e-mail válido.") });

function DriverPasswordRecoveryPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError(null);

    const parsed = schema.safeParse(Object.fromEntries(new FormData(event.currentTarget).entries()));
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Informe seu e-mail.");
      return;
    }

    setLoading(true);
    try {
      const redirectTo = getDriverPasswordRecoveryRedirectTo();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        parsed.data.email.toLowerCase(),
        redirectTo ? { redirectTo } : undefined,
      );
      if (resetError) throw resetError;
      setSent(true);
    } catch (caughtError) {
      console.warn("[apois.motorista.recovery] request failed", {
        message: caughtError instanceof Error ? caughtError.message : "unknown_error",
      });
      setError("Não foi possível enviar o link agora. Verifique sua conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
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

        <section className="mt-8 rounded-[28px] border border-white/7 bg-[#0D0F11] p-5 shadow-2xl">
          {sent ? (
            <div className="py-4 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-400">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h1 className="mt-5 text-2xl font-black">Confira seu e-mail</h1>
              <p className="mt-3 text-sm leading-6 text-zinc-500">
                Se existir uma conta para esse endereço, enviamos um link seguro para criar uma nova senha.
              </p>
              <Link
                to="/motorista/login"
                className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#F6BE1C] px-5 text-sm font-black text-black"
              >
                Voltar ao login
              </Link>
            </div>
          ) : (
            <>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#F6BE1C]">
                Acesso à conta
              </p>
              <h1 className="mt-2 text-2xl font-black">Esqueci minha senha</h1>
              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Informe o e-mail do seu cadastro de motorista. O link abrirá o APOIS Motorista para você definir uma nova senha.
              </p>

              <form onSubmit={onSubmit} className="mt-7 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
                    E-mail
                  </span>
                  <div className="flex h-14 items-center gap-3 rounded-2xl border border-white/8 bg-black/30 px-4 focus-within:border-[#F6BE1C]/60">
                    <Mail className="h-5 w-5 text-[#F6BE1C]" />
                    <input
                      name="email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      required
                      placeholder="seuemail@exemplo.com"
                      className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-zinc-700"
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
                  {loading ? "Enviando..." : "Enviar link de recuperação"}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
