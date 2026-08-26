/**
 * APOIS — Shared editable profile form.
 * Used by both passenger and driver profile pages.
 * Profile persistence goes through narrow self-service RPCs; ride, dispatch,
 * GPS, realtime and payment tables are never written by this component.
 */
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, PASSENGER_NAV } from "@/components/BottomNav";
import { ApoisDriverBottomNav } from "@/components/ApoisDriverBottomNav";
import { ProfilePhotoUploader } from "@/components/ProfilePhotoUploader";
import { refreshProfilePhotoUrl } from "@/lib/profilePhoto";
import {
  Loader2, Save, Lock, MailCheck, ShieldAlert, Trash2, BadgeCheck, X,
} from "lucide-react";
import { toast } from "sonner";
import { DSButton, DSCard, DSCardContent, DSCardDescription, DSCardHeader, DSCardTitle, DSInput, DSLabel } from "@/design-system";

/**
 * Storage-path vs URL: novos uploads persistem apenas o `path` no banco.
 * Registros antigos podem conter uma URL absoluta (http...) — usamos como está.
 */
async function resolveStoredPhoto(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return (await refreshProfilePhotoUrl(value)) ?? null;
}

/* ---------- Validation helpers ---------- */
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function isValidEmail(v: string) { return emailRe.test(v.trim()); }
export function isValidPhone(v: string) {
  const digits = v.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 14;
}

type Role = "passenger" | "driver";

export type ProfileFormProps = {
  role: Role;
  title: string;
  description: string;
  /** Rendered above the form card (status badges, hero stats). */
  headerSlot?: ReactNode;
  /** Rendered below the form card (driver info card, extra sections). */
  extraSlot?: ReactNode;
  /** Called with the authenticated Auth UID after load. */
  onLoaded?: (ctx: { userId: string }) => void;
};

export function ProfileForm({
  role, title, description, headerSlot, extraSlot, onLoaded,
}: ProfileFormProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [emailVerifiedAt, setEmailVerifiedAt] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [city, setCity] = useState("");

  // Original snapshot to support "Cancel changes".
  const [snapshot, setSnapshot] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error: authError } = await supabase.auth.getUser();
      const u = data.user;
      if (authError || !u) {
        if (alive) setLoading(false);
        return;
      }
      if (!alive) return;
      setUserId(u.id);
      setEmail(u.email ?? "");
      setEmailVerifiedAt(u.email_confirmed_at ?? null);

      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("avatar_url, name, phone, cpf, birth_date, gender, city")
        .eq("auth_user_id", u.id)
        .maybeSingle();

      if (!alive) return;
      if (profileError) {
        console.error("[APOIS Perfil] falha ao carregar perfil", profileError);
        toast.error("Não foi possível carregar seu perfil agora.");
        setLoading(false);
        return;
      }

      const snap = {
        fullName: profile?.name ?? "",
        phone: profile?.phone ?? "",
        cpf: profile?.cpf ?? "",
        birthDate: profile?.birth_date ?? "",
        gender: profile?.gender ?? "",
        city: profile?.city ?? "",
      };
      setPhotoUrl(await resolveStoredPhoto(profile?.avatar_url));
      setFullName(snap.fullName);
      setPhone(snap.phone);
      setCpf(snap.cpf);
      setBirthDate(snap.birthDate);
      setGender(snap.gender);
      setCity(snap.city);
      setSnapshot(snap);
      setLoading(false);
      onLoaded?.({ userId: u.id });
    })();
    return () => { alive = false; };
  }, [onLoaded]);

  function markDirty() { if (!dirty) setDirty(true); }

  function cancelChanges() {
    if (!snapshot) return;
    setFullName(snapshot.fullName);
    setPhone(snapshot.phone);
    setCpf(snapshot.cpf);
    setBirthDate(snapshot.birthDate);
    setGender(snapshot.gender);
    setCity(snapshot.city);
    setNewPassword("");
    setConfirmPassword("");
    setDirty(false);
    toast("Alterações descartadas.");
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!userId) return;

    if (!fullName.trim()) { toast.error("Informe seu nome completo."); return; }
    if (!phone.trim() || !isValidPhone(phone)) { toast.error("Telefone inválido."); return; }
    if (email && !isValidEmail(email)) { toast.error("E-mail inválido."); return; }
    if (newPassword && newPassword !== confirmPassword) { toast.error("As senhas não coincidem."); return; }
    if (newPassword && newPassword.length < 6) { toast.error("Senha precisa ter pelo menos 6 caracteres."); return; }

    setSaving(true);
    try {
      const { data: profileResult, error: profErr } = await (supabase as any).rpc("update_own_profile", {
        _name: fullName.trim(),
        _phone: phone.trim(),
        _cpf: cpf || null,
        _birth_date: birthDate || null,
        _gender: gender || null,
        _city: city || null,
      });
      if (profErr) throw profErr;

      const authUpdate: { data?: Record<string, string>; password?: string } = {
        data: { full_name: fullName.trim(), phone: phone.trim(), city },
      };
      if (newPassword) authUpdate.password = newPassword;
      const { error: authErr } = await supabase.auth.updateUser(authUpdate);
      if (authErr) throw authErr;

      const nextSnapshot = {
        fullName: fullName.trim(),
        phone: phone.trim(),
        cpf,
        birthDate,
        gender,
        city,
      };
      setSnapshot(nextSnapshot);
      setFullName(nextSnapshot.fullName);
      setPhone(nextSnapshot.phone);
      setNewPassword("");
      setConfirmPassword("");
      setDirty(false);

      if (role === "driver" && profileResult?.driver_review_required) {
        toast.success("Perfil atualizado. As alterações do cadastro foram enviadas para análise.");
      } else {
        toast.success("Perfil atualizado com sucesso!");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoUploaded(result: { signedUrl: string; path: string }) {
    if (!userId) return;
    // ProfilePhotoUploader já vinculou o path pelo RPC canônico.
    setPhotoUrl(result.signedUrl);
    toast.success("Foto atualizada!");
  }

  async function handlePhotoRemoved() {
    if (!userId) return;
    try {
      const { data, error } = await (supabase as any).rpc("clear_own_profile_photo");
      if (error) throw error;
      if (!data?.ok) throw new Error("Não foi possível remover a foto.");
      const { error: authError } = await supabase.auth.updateUser({ data: { avatar_path: "", avatar_url: "" } });
      if (authError) throw authError;
      setPhotoUrl(null);
      toast.success("Foto removida.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao remover a foto.");
    }
  }

  async function handleVerifyEmail() {
    if (!email || emailVerifiedAt) return;
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      toast.success("Enviamos um e-mail de verificação para você.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar.");
    }
  }

  async function handleDeleteAccount() {
    if (!userId) return;
    const ok = window.confirm("Tem certeza? Sua conta será marcada para exclusão e você será desconectado.");
    if (!ok) return;
    try {
      const { data, error: deleteError } = await (supabase as any).rpc("request_own_account_deletion");
      if (deleteError) throw deleteError;
      if (!data?.ok) throw new Error("Não foi possível solicitar a exclusão da conta.");
      await supabase.auth.signOut();
      toast.success("Conta marcada para exclusão.");
      navigate({ to: "/" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao excluir.";
      toast.error(
        /active_ride_blocks_account_deletion/i.test(message)
          ? "Finalize ou cancele a corrida em andamento antes de excluir sua conta."
          : message,
      );
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <MovviHeader logoutRedirect="/" />
      <main className="flex-1 px-4 py-6 pb-28" style={{ paddingBottom: "calc(7rem + env(safe-area-inset-bottom))" }}>
        <div className="container mx-auto max-w-2xl space-y-5 animate-fade-slide">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando perfil...
            </div>
          ) : (
            <>
              {headerSlot}

              <DSCard>
                <DSCardHeader>
                  <DSCardTitle className="break-words text-2xl">{title}</DSCardTitle>
                  <DSCardDescription className="break-words">{description}</DSCardDescription>
                </DSCardHeader>
                <DSCardContent>
                  <form onSubmit={onSave} className="space-y-6">
                    {userId && (
                      <div className="flex flex-col items-center gap-2">
                        <ProfilePhotoUploader
                          userId={userId}
                          name={fullName || email}
                          currentUrl={photoUrl}
                          onUploaded={handlePhotoUploaded}
                          onRemove={handlePhotoRemoved}
                          size={112}
                        />
                      </div>
                    )}

                    <SectionTitle>Dados pessoais</SectionTitle>

                    <div className="space-y-1.5">
                      <DSLabel htmlFor="full_name">Nome completo *</DSLabel>
                      <DSInput id="full_name" required value={fullName}
                        onChange={(e) => { setFullName(e.target.value); markDirty(); }}
                        placeholder="Como devemos te chamar" />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="min-w-0 space-y-1.5">
                        <DSLabel htmlFor="cpf">CPF</DSLabel>
                        <DSInput id="cpf" value={cpf}
                          onChange={(e) => { setCpf(e.target.value); markDirty(); }}
                          placeholder="000.000.000-00" />
                      </div>
                      <div className="min-w-0 space-y-1.5">
                        <DSLabel htmlFor="birth_date">Data de nascimento</DSLabel>
                        <DSInput id="birth_date" type="date" value={birthDate}
                          onChange={(e) => { setBirthDate(e.target.value); markDirty(); }} />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="min-w-0 space-y-1.5">
                        <DSLabel htmlFor="gender">Gênero (opcional)</DSLabel>
                        <select id="gender" value={gender}
                          onChange={(e) => { setGender(e.target.value); markDirty(); }}
                          className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm transition-colors focus-visible:outline-none focus-visible:border-primary/70 focus-visible:ring-2 focus-visible:ring-primary/25">
                          <option value="">Prefiro não informar</option>
                          <option value="feminino">Feminino</option>
                          <option value="masculino">Masculino</option>
                          <option value="nao-binario">Não-binário</option>
                          <option value="outro">Outro</option>
                        </select>
                      </div>
                      <div className="min-w-0 space-y-1.5">
                        <DSLabel htmlFor="city">Cidade</DSLabel>
                        <DSInput id="city" value={city}
                          onChange={(e) => { setCity(e.target.value); markDirty(); }}
                          placeholder="Sua cidade" />
                      </div>
                    </div>

                    <SectionTitle>Contato</SectionTitle>
                    <div className="space-y-1.5">
                      <DSLabel>E-mail *</DSLabel>
                      <div className="flex min-w-0 flex-wrap gap-2">
                        <DSInput value={email} disabled className="min-w-0 flex-1 basis-56" />
                        <DSButton
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleVerifyEmail}
                          disabled={Boolean(emailVerifiedAt)}
                          className="shrink-0"
                        >
                          {emailVerifiedAt ? (
                            <><BadgeCheck className="mr-1 h-4 w-4 text-primary" /> Verificado</>
                          ) : (
                            <><MailCheck className="mr-1 h-4 w-4" /> Verificar</>
                          )}
                        </DSButton>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <DSLabel htmlFor="phone">Telefone *</DSLabel>
                      <DSInput id="phone" required inputMode="tel" value={phone}
                        onChange={(e) => { setPhone(e.target.value); markDirty(); }}
                        placeholder="(11) 99999-9999" />
                      <p className="break-words text-xs text-muted-foreground">
                        A verificação por SMS só será exibida quando o fluxo OTP estiver habilitado no backend.
                      </p>
                    </div>

                    {role === "driver" ? (
                      <p className="break-words rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                        Contatos de emergência são gerenciados em Segurança, onde ficam armazenados no cadastro protegido do motorista.
                      </p>
                    ) : null}

                    <SectionTitle>Segurança</SectionTitle>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="min-w-0 space-y-1.5">
                        <DSLabel htmlFor="new_password" className="flex items-center gap-1.5 text-sm">
                          <Lock className="h-3.5 w-3.5" /> Nova senha
                        </DSLabel>
                        <DSInput id="new_password" type="password" autoComplete="new-password"
                          value={newPassword}
                          onChange={(e) => { setNewPassword(e.target.value); markDirty(); }}
                          placeholder="Mín. 6 caracteres" minLength={6} />
                      </div>
                      <div className="min-w-0 space-y-1.5">
                        <DSLabel htmlFor="confirm_password" className="text-sm">Confirmar senha</DSLabel>
                        <DSInput id="confirm_password" type="password" autoComplete="new-password"
                          value={confirmPassword}
                          onChange={(e) => { setConfirmPassword(e.target.value); markDirty(); }}
                          placeholder="Repita a nova senha" minLength={6} />
                      </div>
                    </div>

                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                      <DSButton type="button" variant="outline" onClick={cancelChanges} disabled={!dirty || saving} className="w-full sm:w-auto">
                        <X className="mr-2 h-4 w-4" /> Cancelar
                      </DSButton>
                      <DSButton type="submit" disabled={saving || !dirty} className="w-full sm:min-w-[180px] sm:w-auto">
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {saving ? "Salvando..." : "Salvar alterações"}
                      </DSButton>
                    </div>
                  </form>
                </DSCardContent>
              </DSCard>

              {extraSlot}

              <DSCard className="border-destructive/40">
                <DSCardHeader>
                  <DSCardTitle className="flex flex-wrap items-center gap-2 text-base text-destructive">
                    <ShieldAlert className="h-5 w-5 shrink-0" /> Zona perigosa
                  </DSCardTitle>
                  <DSCardDescription className="break-words">
                    Sua conta será marcada como excluída e você perderá acesso imediato.
                  </DSCardDescription>
                </DSCardHeader>
                <DSCardContent>
                  <DSButton type="button" variant="destructive" onClick={handleDeleteAccount} className="w-full sm:w-auto">
                    <Trash2 className="mr-2 h-4 w-4" /> Excluir minha conta
                  </DSButton>
                </DSCardContent>
              </DSCard>
            </>
          )}
        </div>
      </main>
      {role === "driver" ? <ApoisDriverBottomNav /> : <BottomNav items={PASSENGER_NAV} />}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="break-words border-b border-border pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}
