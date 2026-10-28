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
        <h1 className="mt-2 text-3xl font-black tracking-tight">Recuperar senha</h1>
        <p className="mt-3 text-sm leading-6 text-[#606B7A]">
          Informe o e-mail cadastrado. Enviaremos um link seguro para criar uma nova senha.
        </p>
        {requested ? (
          <div role="status" className="mt-7 rounded-xl border border-[#E1E4EA] bg-[#F6F7F9] p-4 text-sm leading-6">
            Se este e-mail estiver cadastrado, você receberá o link de recuperação. Confira também a caixa de spam.
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
              {submitting ? "Enviando..." : "Enviar link de recuperação"}
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
