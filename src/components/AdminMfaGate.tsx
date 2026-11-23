import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { APOIS_OFFICIAL_RED_LOGO_URL } from "@/assets/apoisOfficial2026";
import "@/apois-admin-theme.css";

type Step = "checking" | "enroll" | "challenge" | "verified" | "error";

/**
 * MFA do Supabase Auth para telas administrativas.
 *
 * Fail-closed: se não pudermos verificar AAL2, o painel NÃO é exibido.
 * O fluxo de cadastro TOTP ocorre aqui, sem necessidade de permissões admin
 * no banco, para evitar bloqueio permanente do primeiro acesso.
 */
export function AdminMfaGate({
  children,
  loginPath = "/login",
  onVerified,
}: {
  children: ReactNode;
  loginPath?: string;
  onVerified?: () => void;
}) {
  const [step, setStep] = useState<Step>("checking");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function checkAssurance() {
    setStep("checking");
    setMessage("");
    try {
      const { data: level, error: levelError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (levelError || !level) throw levelError ?? new Error("Não foi possível verificar o MFA.");
      if (level.currentLevel === "aal2") {
        setStep("verified");
        onVerified?.();
        return;
      }
      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;
      const verifiedTotp = factors?.totp?.find((factor) => factor.status === "verified");
      if (verifiedTotp) {
        setFactorId(verifiedTotp.id);
        setStep("challenge");
      } else {
        setFactorId(null);
        setQrCode("");
        setSecret("");
        setStep("enroll");
      }
    } catch {
      setMessage("Não foi possível confirmar sua autenticação. Confira a conexão e tente novamente.");
      setStep("error");
    }
  }

  useEffect(() => {
    void checkAssurance();
  }, []);

  async function beginEnrollment() {
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "APOIS - acesso administrativo",
      });
      if (error || !data?.totp) throw error ?? new Error("Falha ao cadastrar o autenticador.");
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
    } catch {
      setMessage("Não foi possível gerar o QR Code. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factorId || !/^\d{6}$/.test(code.trim())) {
      setMessage("Informe o código de seis dígitos do aplicativo autenticador.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: code.trim(),
      });
      if (error) throw error;
      const { data: level, error: levelError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (levelError || level?.currentLevel !== "aal2") {
        throw levelError ?? new Error("A sessão ainda não está em AAL2.");
      }
      setCode("");
      setSecret("");
      setQrCode("");
      setStep("verified");
      onVerified?.();
    } catch {
      setMessage("Código inválido ou expirado. Gere outro código e tente novamente.");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.assign(loginPath);
  }

  if (step === "verified") return <>{children}</>;
  if (step === "checking") {
    return (
      <main className="apois-admin-theme grid min-h-dvh place-items-center bg-[#F6F7F9] px-4 text-[#182130]">
        <p role="status" className="text-sm font-medium text-[#606B7A]">Verificando autenticação de dois fatores...</p>
      </main>
    );
  }

  return (
    <main className="apois-admin-theme grid min-h-dvh place-items-center bg-[#F6F7F9] px-4 py-10 text-[#182130]">
      <section className="w-full max-w-[480px] space-y-5 rounded-3xl border border-[#E1E4EA] bg-white px-6 py-9 shadow-[0_16px_54px_rgba(24,33,48,0.08)] sm:px-10">
        <div>
          <img src={APOIS_OFFICIAL_RED_LOGO_URL} alt="APOIS" width={72} height={72} className="mb-6 h-[72px] w-[72px] rounded-full bg-white object-contain" />
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[.15em] text-[#C9141B]">APOIS Corridas · Administração</p>
          <h1 className="text-2xl font-black tracking-tight text-[#182130]">Proteção do acesso administrativo</h1>
          <p className="mt-2 text-sm leading-6 text-[#606B7A]">
            Para proteger os dados da APOIS, administradores devem confirmar um
            segundo fator de autenticação antes de abrir o painel.
          </p>
        </div>
        {step === "enroll" && (
          <div className="space-y-4">
            <p className="text-sm">
              Instale um aplicativo autenticador e cadastre o acesso administrativo.
              Proteja seu autenticador e mantenha um método seguro de recuperação de acesso.
            </p>
            {!factorId ? (
              <button type="button" disabled={busy} onClick={beginEnrollment}
                className="w-full rounded-xl bg-[#E51B23] px-4 py-3 font-semibold text-white hover:bg-[#C9141B] disabled:opacity-50">
                {busy ? "Gerando QR Code..." : "Cadastrar autenticador"}
              </button>
            ) : (
              <>
                {qrCode && (
                  <img src={qrCode} alt="QR Code para cadastrar o autenticador"
                    className="mx-auto h-44 w-44 rounded-xl border border-[#E1E4EA] bg-white p-2" />
                )}
                {secret && (
                  <p className="break-all rounded-xl bg-[#F6F7F9] p-3 text-xs text-[#293547]">
                    Chave manual (mantenha em sigilo): <code>{secret}</code>
                  </p>
                )}
                <p className="text-sm">Depois de cadastrar, digite o código atual de seis dígitos.</p>
              </>
            )}
          </div>
        )}
        {step === "challenge" && (
          <p className="text-sm">
            Digite o código de seis dígitos do autenticador já cadastrado.
          </p>
        )}
        {(step === "challenge" || (step === "enroll" && factorId)) && (
          <form onSubmit={verifyCode} className="space-y-3">
            <label htmlFor="admin-mfa-code" className="block text-sm font-medium">
              Código do autenticador
            </label>
            <input
              id="admin-mfa-code" type="text" inputMode="numeric"
              autoComplete="one-time-code" pattern="[0-9]{6}"
              maxLength={6} required value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full rounded-xl border border-[#DCE1E8] bg-white px-4 py-3 text-center text-xl tracking-widest text-[#182130]"
            />
            <button type="submit" disabled={busy}
              className="w-full rounded-xl bg-[#E51B23] px-4 py-3 font-semibold text-white hover:bg-[#C9141B] disabled:opacity-50">
              {busy ? "Verificando..." : "Confirmar código"}
            </button>
          </form>
        )}
        {message && <p role="alert" className="text-sm text-[#C9141B]">{message}</p>}
        {step === "error" && (
          <button type="button" onClick={() => void checkAssurance()}
            className="w-full rounded-xl border border-[#DCE1E8] bg-white px-4 py-2 text-[#293547] hover:bg-[#F6F7F9]">
            Tentar novamente
          </button>
        )}
        <button type="button" onClick={() => void signOut()}
          className="w-full rounded-xl border border-[#DCE1E8] bg-white px-4 py-2 text-sm text-[#293547] hover:bg-[#F6F7F9]">
          Sair da conta
        </button>
      </section>
    </main>
  );
}
