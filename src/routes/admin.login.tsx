import { APOIS_OFFICIAL_RED_LOGO_URL } from "@/assets/apoisOfficial2026";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { supabase } from "@/lib/supabaseClient";
import { loadAdminAccess } from "@/lib/adminAccess";
import { useAuthForm } from "@/components/AuthShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ShieldCheck } from "lucide-react";
import { DSButton, DSInput, DSLabel } from "@/design-system";
import "@/apois-admin-theme.css";

export const Route = createFileRoute("/admin/login")({
  head: () => ({ meta: [{ title: "Admin — APOIS" }, { name: "robots", content: "noindex" }] }),
  component: AdminLoginPage,
});

const schema = z.object({
  email: z.string().trim().max(254, "E-mail muito longo").email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha").max(256, "Senha muito longa"),
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const { error, setError, loading, handle } = useAuthForm();

  const onSubmit = handle(async (form) => {
    setError(null);
    const parsed = schema.safeParse(Object.fromEntries(form.entries()));
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revise os dados informados.");
      return;
    }

    const credentials = {
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
    };
    const { data, error: signInError } = await supabase.auth.signInWithPassword(credentials);
    if (signInError || !data.user) {
      setError("E-mail ou senha inválidos.");
      return;
    }

    try {
      const access = await loadAdminAccess();
      if (!access?.authorized) {
        await supabase.auth.signOut();
        setError("Esta conta não possui acesso administrativo ativo.");
        return;
      }
      await navigate({ to: "/admin/dashboard" });
    } catch (accessError) {
      await supabase.auth.signOut().catch(() => undefined);
      setError("Não foi possível validar o acesso administrativo agora. Entre novamente em alguns instantes.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao validar RBAC após login", accessError);
    }
  });

  return (
    <div className="apois-admin-theme min-h-dvh w-full bg-[#F6F7F9] text-foreground" data-apois-admin-desktop-login="2026">
      <div className="grid min-h-dvh w-full lg:grid-cols-[minmax(0,1fr)_minmax(480px,0.88fr)]">
        <aside className="relative hidden min-h-dvh flex-col justify-between overflow-hidden bg-[#182130] p-12 text-white lg:flex xl:p-16" aria-label="Identidade APOIS Corridas">
          <div className="pointer-events-none absolute -left-32 bottom-[-270px] h-[560px] w-[560px] rounded-full border-[90px] border-[#E51B23]/15" aria-hidden="true" />
          <div className="pointer-events-none absolute -right-40 top-[-220px] h-[550px] w-[550px] rounded-full bg-[#E51B23]/10 blur-3xl" aria-hidden="true" />
          <div className="relative z-10 flex items-center gap-3">
            <img src={APOIS_OFFICIAL_RED_LOGO_URL} alt="APOIS" className="h-16 w-16 rounded-full bg-white object-contain" width="64" height="64" />
            <div>
              <div className="text-xl font-black tracking-[0.10em]">APOIS</div>
              <div className="text-xs font-bold uppercase tracking-[0.19em] text-[#FF777B]">Corridas · Administração</div>
            </div>
          </div>
          <div className="relative z-10 max-w-xl space-y-6">
            <div className="h-1.5 w-16 rounded-full bg-[#E51B23]" />
            <h1 className="max-w-lg text-4xl font-black leading-[1.13] tracking-tight xl:text-5xl">
              Gestão inteligente de mobilidade.
            </h1>
            <p className="max-w-md text-base leading-7 text-white/70">
              Central de administração, operações e acompanhamento do APOIS Corridas.
            </p>
          </div>
          <div className="relative z-10 flex items-center justify-between gap-4 border-t border-white/15 pt-6 text-xs text-white/55">
            <span>APOIS Tecnologia e Mobilidade</span>
            <span>Área de acesso restrito</span>
          </div>
        </aside>

        <main className="flex min-h-dvh items-center justify-center px-5 py-12 sm:px-10 lg:bg-white lg:px-12" aria-labelledby="apois-admin-login-title">
          <div className="w-full max-w-[460px]">
            <div className="mb-10 flex items-center gap-3 lg:mb-12">
              <img
                src={APOIS_OFFICIAL_RED_LOGO_URL}
                alt="Logomarca APOIS"
                className="h-16 w-16 shrink-0 rounded-full bg-white object-contain shadow-[0_8px_24px_rgba(229,27,35,0.10)]"
                width="64"
                height="64"
              />
              <div className="min-w-0">
                <div className="text-xl font-black leading-none tracking-[0.07em] text-[#182130]">APOIS</div>
                <div className="mt-1 text-xs font-extrabold uppercase tracking-[0.19em] text-[#C9141B]">Corridas · Administração</div>
              </div>
            </div>
            <div className="mb-9">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.19em] text-[#C9141B]">Acesso administrativo</p>
              <h2 id="apois-admin-login-title" className="text-3xl font-black tracking-tight text-[#182130] sm:text-[35px]">Entrar no painel</h2>
              <p className="mt-3 text-sm leading-6 text-[#606B7A]">
                Utilize suas credenciais autorizadas para acessar a gestão do APOIS Corridas.
              </p>
            </div>
            <form onSubmit={onSubmit} method="post" className="space-y-5" noValidate>
              <div className="space-y-2">
                <DSLabel htmlFor="email">E-mail</DSLabel>
                <DSInput
                  id="email"
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="email"
                  inputMode="email"
                  placeholder="seuemail@exemplo.com"
                  className="min-h-12 rounded-xl border-[#DCE1E8] bg-white px-4 text-base text-[#182130] shadow-sm"
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <DSLabel htmlFor="password">Senha</DSLabel>
                <DSInput
                  id="password"
                  name="password"
                  type="password"
                  required
                  maxLength={256}
                  autoComplete="current-password"
                  placeholder="Digite sua senha"
                  className="min-h-12 rounded-xl border-[#DCE1E8] bg-white px-4 text-base text-[#182130] shadow-sm"
                  disabled={loading}
                />
              </div>
              {error ? (
                <Alert variant="destructive" role="alert" aria-live="polite">
                  <AlertDescription className="break-words">{error}</AlertDescription>
                </Alert>
              ) : null}
              <DSButton
                type="submit"
                className="mt-2 min-h-12 w-full rounded-xl bg-[#E51B23] text-base font-bold text-white shadow-[0_12px_24px_-14px_rgba(229,27,35,0.65)] transition-colors hover:bg-[#C9141B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E51B23]"
                disabled={loading}
                aria-busy={loading}
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />}
                {loading ? "Entrando…" : "Entrar com segurança"}
              </DSButton>
            </form>
            <p className="mt-10 border-t border-[#E1E4EA] pt-5 text-center text-xs leading-5 text-[#6B7380]">
              Acesso exclusivo à equipe autorizada da APOIS. Suas permissões são verificadas após o login.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
