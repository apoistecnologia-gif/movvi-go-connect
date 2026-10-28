import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { APOIS_OFFICIAL_RED_LOGO_URL } from "@/assets/apoisOfficial2026";
import { DSButton, DSInput, DSLabel } from "@/design-system";
import "@/apois-admin-theme.css";

export const Route = createFileRoute("/admin/redefinir-senha")({
  ssr: false,
  head: () => ({ meta: [{ title: "Criar nova senha — APOIS Corridas" }, { name: "robots", content: "noindex" }] }),
  component: AdminPasswordReset,
});

function AdminPasswordReset() {
  const [status, setStatus] = useState<"checking" | "valid" | "invalid">("checking");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (active && event === "PASSWORD_RECOVERY" && session) setStatus("valid");
    });

    async function establishRecoverySession() {
      try {
        const url = new URL(window.location.href);
        const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
        const code = url.searchParams.get("code");
        const tokenHash = url.searchParams.get("token_hash");
        const recoveryType = url.searchParams.get("type") ?? hash.get("type");
        if (url.searchParams.get("error") || hash.get("error")) throw new Error("expired");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          if (active) setStatus("valid");
        } else if (tokenHash && recoveryType === "recovery") {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
          if (error) throw error;
          if (active) setStatus("valid");
        } else if (recoveryType === "recovery" && hash.get("access_token")) {
          // Supabase JS processes the implicit link and emits PASSWORD_RECOVERY.
          const { data: { session }, error } = await supabase.auth.getSession();
          if (error || !session) throw error ?? new Error("expired");
          if (active) setStatus("valid");
        } else if (active) {
          // An ordinary authenticated session is NOT proof of password recovery.
          setStatus((current) => current === "valid" ? current : "invalid");
        }
      } catch {
        if (active) setStatus("invalid");
      }
    }
    void establishRecoverySession();
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status !== "valid" || submitting) return;
    setMessage(null);
    if (newPassword.length < 10 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setMessage("Use pelo menos 10 caracteres, incluindo letras e números.");
      return;
    }
    if (newPassword !== confirm) {
      setMessage("As senhas não coincidem.");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setMessage("Não foi possível atualizar a senha. Solicite outro link, se necessário.");
        return;
      }
      await supabase.auth.signOut();
      setCompleted(true);
      setNewPassword("");
      setConfirm("");
    } catch {
      setMessage("Falha de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="apois-admin-theme flex min-h-dvh items-center justify-center bg-[#F6F7F9] px-5 py-12 text-[#182130]">
      <section className="w-full max-w-[480px] rounded-3xl border border-[#E1E4EA] bg-white px-6 py-9 shadow-[0_16px_54px_rgba(24,33,48,0.08)] sm:px-10">
        <img src={APOIS_OFFICIAL_RED_LOGO_URL} alt="APOIS" width="72" height="72" className="h-[72px] w-[72px] rounded-full bg-white object-contain" />
        <p className="mt-6 text-xs font-extrabold uppercase tracking-[.15em] text-[#C9141B]">APOIS Corridas · Administração</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Criar nova senha</h1>
        {status === "checking" && <div role="status" className="mt-6 flex items-center gap-2 text-sm text-[#606B7A]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Validando seu link...</div>}
        {status === "invalid" && (
          <div role="alert" className="mt-6 text-sm text-[#C9141B]">
            Link inválido ou expirado. Solicite outro e-mail de recuperação.
          </div>
        )}
        {completed ? (
          <p role="status" className="mt-6 text-sm text-[#606B7A]">Sua senha foi atualizada com sucesso. Entre novamente no painel.</p>
        ) : status === "valid" ? (
          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <div className="space-y-2">
              <DSLabel htmlFor="admin-new-password">Nova senha</DSLabel>
              <div className="relative">
                <DSInput id="admin-new-password" autoComplete="new-password" type={visible ? "text" : "password"} required
                  minLength={10} maxLength={256} value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  className="min-h-12 rounded-xl border-[#DCE1E8] bg-white px-4 pr-12" />
                <button type="button" onClick={() => setVisible((v) => !v)}
                  aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-[#606B7A]">
                  {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <DSLabel htmlFor="admin-confirm-password">Confirmar nova senha</DSLabel>
              <DSInput id="admin-confirm-password" type="password" autoComplete="new-password" required minLength={10}
                maxLength={256} value={confirm} onChange={(e) => setConfirm(e.target.value)}
                className="min-h-12 rounded-xl border-[#DCE1E8] bg-white px-4" />
            </div>
            {message && <p role="alert" className="text-sm text-[#C9141B]">{message}</p>}
            <DSButton type="submit" disabled={submitting} className="min-h-12 w-full rounded-xl bg-[#E51B23] font-bold text-white hover:bg-[#C9141B]">
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <LockKeyhole className="mr-2 h-4 w-4" aria-hidden="true" />}
              {submitting ? "Salvando..." : "Salvar nova senha"}
            </DSButton>
          </form>
        ) : null}
        <Link to={completed ? "/admin/login" : "/admin/recuperar-senha"}
          className="mt-7 inline-flex text-sm font-bold text-[#C9141B] hover:underline">
          {completed ? "Entrar no painel" : "Solicitar novo link"}
        </Link>
      </section>
    </main>
  );
}
