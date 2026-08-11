import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { supabase } from "@/lib/supabaseClient";
import { loadAdminAccess } from "@/lib/adminAccess";
import { Loader2, ShieldCheck } from "lucide-react";
import "@/apois-admin-theme.css";

export const Route = createFileRoute("/admin/login")({
  head: () => ({ meta: [{ title: "Admin — APOIS" }, { name: "robots", content: "noindex" }] }),
  component: AdminLoginPage,
});

const schema = z.object({
  email: z.string().trim().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const form = new FormData(event.currentTarget);
      const parsed = schema.parse(Object.fromEntries(form.entries()));
      const { data, error: signInError } = await supabase.auth.signInWithPassword(parsed);
      if (signInError || !data.user) throw new Error("Credenciais inválidas");

      const access = await loadAdminAccess();
      if (!access?.authorized) {
        await supabase.auth.signOut();
        throw new Error("Esta conta não possui acesso administrativo ativo.");
      }

      await navigate({ to: "/admin/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar agora.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="apois-admin-theme min-h-screen bg-background text-foreground">
      <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-8">
        <section className="w-full rounded-3xl border border-border/70 bg-card p-6 shadow-xl">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/40 bg-primary/10">
              <span className="text-lg font-black tracking-tight">AP</span>
            </div>
            <div className="mb-4 text-sm font-black tracking-[0.18em]">APOIS <span className="text-primary">ADMIN</span></div>
            <h1 className="flex items-center justify-center gap-2 text-2xl font-bold">
              <ShieldCheck className="h-6 w-6 text-primary" /> Painel administrativo
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">Acesso restrito à equipe APOIS.</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4" autoComplete="off">
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-semibold">E-mail</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                inputMode="email"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                className="h-11 w-full rounded-xl border border-input bg-background px-4 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-semibold">Senha</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="off"
                className="h-11 w-full rounded-xl border border-input bg-background px-4 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {error ? (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground shadow-lg shadow-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Entrar
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
