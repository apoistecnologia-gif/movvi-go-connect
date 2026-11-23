import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Mail, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { APOIS_OFFICIAL_RED_LOGO_URL } from "@/assets/apoisOfficial2026";
import { DSButton, DSInput, DSLabel } from "@/design-system";
import "@/apois-admin-theme.css";

export const Route = createFileRoute("/admin/recuperar-senha")({
  ssr: false,
  head: () => ({ meta: [{ title: "Recuperar senha — APOIS Corridas" }, { name: "robots", content: "noindex" }] }),
  component: AdminPasswordRecovery,
});

function AdminPasswordRecovery() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requested, setRequested] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [verifiedUserId, setVerifiedUserId] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [completed, setCompleted] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.length > 254) {
      setMessage("Informe um e-mail válido.");
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: `${window.location.origin}/admin/redefinir-senha`,
      });
      if (error) {
        // Do not expose whether a user exists in Supabase Auth.
        setMessage("Não foi possível processar a solicitação agora. Tente novamente mais tarde.");
        return;
      }
      setRequested(true);
      setRecoveryCode("");
      setVerifiedUserId(null);
    } catch {
      setMessage("Falha de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onVerifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (verifyingCode) return;
    if (!/^\d{6,8}$/.test(recoveryCode)) {
      setMessage("Digite o código numérico completo recebido no e-mail.");
      return;
    }

    setVerifyingCode(true);
    setMessage(null);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: recoveryCode,
        type: "recovery",
      });
      // The recovery OTP must establish an authenticated session for the same
      // email; an existing ordinary session does not unlock this form.
      if (error || !data.session || !data.user ||
          data.user.email?.toLowerCase() !== email.trim().toLowerCase()) {
        setMessage("Código inválido ou expirado. Confira o e-mail e tente novamente.");
        return;
      }
      setVerifiedUserId(data.user.id);
      setRecoveryCode("");
    } catch {
      setMessage("Não foi possível verificar o código. Confira sua conexão.");
    } finally {
      setVerifyingCode(false);
    }
  }

  async function onSavePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!verifiedUserId || savingPassword) return;
    if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setMessage("Use pelo menos 10 caracteres, incluindo letras e números.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("As senhas não coincidem.");
      return;
    }

    setSavingPassword(true);
    setMessage(null);
    try {
      const { data: identity, error: identityError } = await supabase.auth.getUser();
      if (identityError || identity.user?.id !== verifiedUserId) {
        setMessage("A sessão de recuperação expirou. Solicite outro código.");
        setVerifiedUserId(null);
        return;
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setMessage("Não foi possível atualizar a senha. Escolha outra senha ou solicite novo código.");
        return;
      }
      setCompleted(true);
      setVerifiedUserId(null);
      setPassword("");
      setConfirmPassword("");
      await supabase.auth.signOut();
    } catch {
      setMessage("Não foi possível concluir a operação. Confira sua conexão.");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <main className="apois-admin-theme flex min-h-dvh items-center justify-center bg-[#F6F7F9] px-5 py-12 text-[#182130]">
      <section className="w-full max-w-[480px] rounded-3xl border border-[#E1E4EA] bg-white px-6 py-9 shadow-[0_16px_54px_rgba(24,33,48,0.08)] sm:px-10">
        <img src={APOIS_OFFICIAL_RED_LOGO_URL} alt="APOIS" width="72" height="72" className="h-[72px] w-[72px] rounded-full bg-white object-contain" />
        <p className="mt-6 text-xs font-extrabold uppercase tracking-[.15em] text-[#C9141B]">APOIS Corridas · Administração</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Recuperar senha</h1>
        <p className="mt-3 text-sm leading-6 text-[#606B7A]">
          Informe o e-mail cadastrado. Enviaremos um código ou link seguro para criar uma nova senha.
        </p>
        {completed ? (
          <div role="status" className="mt-7 rounded-xl border border-green-200 bg-green-50 p-4 text-sm leading-6 text-green-900">
            Senha atualizada com sucesso. Entre novamente no painel usando sua nova senha.
          </div>
        ) : verifiedUserId ? (
          <form onSubmit={onSavePassword} className="mt-7 space-y-4">
            <div role="status" className="rounded-xl bg-[#F6F7F9] p-3 text-sm">
              Código confirmado. Agora defina sua nova senha.
            </div>
            <div className="space-y-2">
              <DSLabel htmlFor="new-password">Nova senha</DSLabel>
              <DSInput id="new-password" type="password" autoComplete="new-password"
                minLength={10} maxLength={256} required disabled={savingPassword}
                value={password} onChange={(event) => setPassword(event.target.value)}
                className="min-h-12 rounded-xl border-[#DCE1E8] bg-white px-4" />
            </div>
            <div className="space-y-2">
              <DSLabel htmlFor="confirm-password">Confirmar nova senha</DSLabel>
              <DSInput id="confirm-password" type="password" autoComplete="new-password"
                minLength={10} maxLength={256} required disabled={savingPassword}
                value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)}
                className="min-h-12 rounded-xl border-[#DCE1E8] bg-white px-4" />
            </div>
            {message && <p role="alert" className="text-sm text-[#C9141B]">{message}</p>}
            <DSButton type="submit" disabled={savingPassword}
              className="min-h-12 w-full rounded-xl bg-[#E51B23] font-bold text-white hover:bg-[#C9141B]">
              {savingPassword ? "Salvando..." : "Salvar nova senha"}
            </DSButton>
          </form>
        ) : requested ? (
          <div className="mt-7 space-y-4">
            <div role="status" className="rounded-xl border border-[#E1E4EA] bg-[#F6F7F9] p-4 text-sm leading-6">
              Se este e-mail estiver cadastrado, você receberá um código ou link de recuperação.
              Digite o código recebido abaixo. Confira também a caixa de spam.
            </div>
            <form onSubmit={onVerifyCode} className="space-y-4">
              <div className="space-y-2">
                <DSLabel htmlFor="recovery-code">Código recebido no e-mail</DSLabel>
                <DSInput id="recovery-code" type="text" inputMode="numeric"
                  autoComplete="one-time-code" pattern="[0-9]{6,8}" maxLength={8}
                  placeholder="Digite o código" required disabled={verifyingCode}
                  value={recoveryCode}
                  onChange={(event) => setRecoveryCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
                  className="min-h-12 rounded-xl border-[#DCE1E8] bg-white px-4 text-center tracking-widest" />
              </div>
              {message && <p role="alert" className="text-sm text-[#C9141B]">{message}</p>}
              <DSButton type="submit" disabled={verifyingCode || recoveryCode.length < 6}
                className="min-h-12 w-full rounded-xl bg-[#E51B23] font-bold text-white hover:bg-[#C9141B]">
                {verifyingCode ? "Verificando..." : "Verificar código"}
              </DSButton>
            </form>
            <button type="button" onClick={() => { setRequested(false); setRecoveryCode(""); setMessage(null); }}
              className="text-sm font-semibold text-[#C9141B] hover:underline">
              Solicitar novo código
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <div className="space-y-2">
              <DSLabel htmlFor="recovery-email">E-mail da conta</DSLabel>
              <DSInput id="recovery-email" type="email" name="email" maxLength={254} value={email}
                autoComplete="email" required disabled={submitting} onChange={(event) => setEmail(event.target.value)}
                placeholder="seuemail@exemplo.com" className="min-h-12 rounded-xl border-[#DCE1E8] bg-white px-4" />
            </div>
            {message && <p role="alert" className="text-sm text-[#C9141B]">{message}</p>}
            <DSButton type="submit" disabled={submitting} className="min-h-12 w-full rounded-xl bg-[#E51B23] font-bold text-white hover:bg-[#C9141B]">
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Mail className="mr-2 h-4 w-4" aria-hidden="true" />}
              {submitting ? "Enviando..." : "Enviar código de recuperação"}
            </DSButton>
          </form>
        )}
        <Link to="/admin/login" className="mt-7 inline-flex text-sm font-bold text-[#C9141B] hover:underline">Voltar ao login</Link>
        <div className="mt-6 flex items-center gap-2 border-t border-[#E1E4EA] pt-5 text-xs text-[#606B7A]">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" /> Somente o titular do e-mail poderá redefinir sua senha.
        </div>
      </section>
    </main>
  );
}
