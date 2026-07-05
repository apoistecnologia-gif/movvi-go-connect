/**
 * MOVVI — Shared editable profile form.
 * Used by both passenger and driver profile pages.
 * ❗ Purely UI + `users` table updates — NEVER touches ride tables, dispatch,
 * GPS, realtime or payment logic.
 */
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, PASSENGER_NAV, DRIVER_NAV } from "@/components/BottomNav";
import { Label } from "@/components/ui/label";
import { ProfilePhotoUploader } from "@/components/ProfilePhotoUploader";
import {
  Loader2, Save, Lock, MailCheck, PhoneCall, ShieldAlert, Trash2, BadgeCheck, X,
} from "lucide-react";
import { toast } from "sonner";
import { DSButton, DSCard, DSCardContent, DSCardDescription, DSCardHeader, DSCardTitle, DSInput } from "@/design-system";

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
  /** Called with the fresh users row after load, so parents can render extras. */
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
  const [phoneVerifiedAt, setPhoneVerifiedAt] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [city, setCity] = useState("");

  // Original snapshot to support "Cancel changes".
  const [snapshot, setSnapshot] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (!u) { if (alive) setLoading(false); return; }
      if (!alive) return;
      setUserId(u.id);
      setEmail(u.email ?? "");

      const { data: profile } = await supabase
        .from("users")
        .select("avatar_url, name, phone, cpf, birth_date, gender, emergency_contact_name, emergency_contact_phone, city, email_verified_at, phone_verified_at")
        .eq("auth_user_id", u.id)
        .maybeSingle();

      if (!alive) return;
      const snap = {
        fullName: profile?.name ?? "",
        phone: profile?.phone ?? "",
        cpf: profile?.cpf ?? "",
        birthDate: profile?.birth_date ?? "",
        gender: profile?.gender ?? "",
        emergencyName: profile?.emergency_contact_name ?? "",
        emergencyPhone: profile?.emergency_contact_phone ?? "",
        city: profile?.city ?? "",
      };
      setPhotoUrl(profile?.avatar_url ?? null);
      setFullName(snap.fullName);
      setPhone(snap.phone);
      setCpf(snap.cpf);
      setBirthDate(snap.birthDate);
      setGender(snap.gender);
      setEmergencyName(snap.emergencyName);
      setEmergencyPhone(snap.emergencyPhone);
      setCity(snap.city);
      setEmailVerifiedAt(profile?.email_verified_at ?? null);
      setPhoneVerifiedAt(profile?.phone_verified_at ?? null);
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
    setEmergencyName(snapshot.emergencyName);
    setEmergencyPhone(snapshot.emergencyPhone);
    setCity(snapshot.city);
    setNewPassword("");
    setConfirmPassword("");
    setDirty(false);
    toast("Alterações descartadas.");
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!userId) return;

    // Validation
    if (!fullName.trim()) { toast.error("Informe seu nome completo."); return; }
    if (!phone.trim() || !isValidPhone(phone)) { toast.error("Telefone inválido."); return; }
    if (email && !isValidEmail(email)) { toast.error("E-mail inválido."); return; }
    if (emergencyPhone && !isValidPhone(emergencyPhone)) {
      toast.error("Telefone do contato de emergência inválido."); return;
    }
    if (newPassword && newPassword !== confirmPassword) { toast.error("As senhas não coincidem."); return; }
    if (newPassword && newPassword.length < 6) { toast.error("Senha precisa ter pelo menos 6 caracteres."); return; }

    setSaving(true);
    try {
      const { error: profErr } = await supabase
        .from("users")
        .update({
          name: fullName.trim(),
          phone: phone.trim(),
          cpf: cpf || null,
          birth_date: birthDate || null,
          gender: gender || null,
          emergency_contact_name: emergencyName || null,
          emergency_contact_phone: emergencyPhone || null,
          city: city || null,
        })
        .eq("auth_user_id", userId);
      if (profErr) throw profErr;

      // Keep driver display fields in sync for driver-side name display only —
      // does NOT touch dispatch, GPS or ride tables.
      if (role === "driver") {
        await supabase.from("drivers").update({ name: fullName.trim(), phone: phone.trim(), city: city || undefined }).eq("user_id", userId);
      }

      const authUpdate: { data?: Record<string, string>; password?: string } = {
        data: { full_name: fullName, phone, city },
      };
      if (newPassword) authUpdate.password = newPassword;
      const { error: authErr } = await supabase.auth.updateUser(authUpdate);
      if (authErr) throw authErr;

      setSnapshot({
        fullName, phone, cpf, birthDate, gender, emergencyName, emergencyPhone, city,
      });
      setNewPassword("");
      setConfirmPassword("");
      setDirty(false);
      toast.success("Perfil atualizado com sucesso!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoUploaded(result: { signedUrl: string; path: string }) {
    if (!userId) return;
    setPhotoUrl(result.signedUrl);
    try {
      const { error } = await supabase.from("users").update({ avatar_url: result.signedUrl }).eq("auth_user_id", userId);
      if (error) throw error;
      if (role === "driver") {
        await supabase.from("drivers").update({ photo_url: result.signedUrl }).eq("user_id", userId);
      }
      await supabase.auth.updateUser({ data: { avatar_url: result.signedUrl } });
      toast.success("Foto atualizada!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar a foto.");
    }
  }

  async function handlePhotoRemoved() {
    if (!userId) return;
    try {
      const { error } = await supabase.from("users").update({ avatar_url: null }).eq("auth_user_id", userId);
      if (error) throw error;
      if (role === "driver") {
        await supabase.from("drivers").update({ photo_url: null }).eq("user_id", userId);
      }
      await supabase.auth.updateUser({ data: { avatar_url: "" } });
      setPhotoUrl(null);
      toast.success("Foto removida.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao remover a foto.");
    }
  }

  async function handleVerifyEmail() {
    if (!email) return;
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      toast.success("Enviamos um e-mail de verificação para você.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar.");
    }
  }

  async function handleVerifyPhone() {
    if (!phone) { toast.error("Preencha o telefone antes de verificar."); return; }
    toast.info("Verificação por SMS em breve. Seu número foi marcado como pendente.");
  }

  async function handleDeleteAccount() {
    if (!userId) return;
    const ok = window.confirm("Tem certeza? Sua conta será marcada para exclusão e você será desconectado.");
    if (!ok) return;
    try {
      await supabase.from("users").update({ deleted_at: new Date().toISOString() }).eq("auth_user_id", userId);
      await supabase.auth.signOut();
      toast.success("Conta marcada para exclusão.");
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir.");
    }
  }

  const nav = role === "passenger" ? PASSENGER_NAV : DRIVER_NAV;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MovviHeader logoutRedirect="/" />
      <main className="flex-1 px-4 py-6 pb-28" style={{ paddingBottom: "max(7rem, env(safe-area-inset-bottom))" }}>
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
                  <DSCardTitle className="text-2xl">{title}</DSCardTitle>
                  <DSCardDescription>{description}</DSCardDescription>
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
                      <Label htmlFor="full_name">Nome completo *</Label>
                      <DSInput id="full_name" required value={fullName}
                        onChange={(e) => { setFullName(e.target.value); markDirty(); }}
                        placeholder="Como devemos te chamar" />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="cpf">CPF</Label>
                        <DSInput id="cpf" value={cpf}
                          onChange={(e) => { setCpf(e.target.value); markDirty(); }}
                          placeholder="000.000.000-00" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="birth_date">Data de nascimento</Label>
                        <DSInput id="birth_date" type="date" value={birthDate}
                          onChange={(e) => { setBirthDate(e.target.value); markDirty(); }} />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="gender">Gênero (opcional)</Label>
                        <select id="gender" value={gender}
                          onChange={(e) => { setGender(e.target.value); markDirty(); }}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm transition-colors focus-visible:outline-none focus-visible:border-primary/70 focus-visible:ring-2 focus-visible:ring-primary/25">
                          <option value="">Prefiro não informar</option>
                          <option value="feminino">Feminino</option>
                          <option value="masculino">Masculino</option>
                          <option value="nao-binario">Não-binário</option>
                          <option value="outro">Outro</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="city">Cidade</Label>
                        <DSInput id="city" value={city}
                          onChange={(e) => { setCity(e.target.value); markDirty(); }}
                          placeholder="Sua cidade" />
                      </div>
                    </div>

                    <SectionTitle>Contato</SectionTitle>
                    <div className="space-y-1.5">
                      <Label>E-mail *</Label>
                      <div className="flex gap-2">
                        <DSInput value={email} disabled />
                        <DSButton type="button" variant="outline" size="sm" onClick={handleVerifyEmail}>
                          {emailVerifiedAt ? (
                            <><BadgeCheck className="mr-1 h-4 w-4 text-primary" /> Verificado</>
                          ) : (
                            <><MailCheck className="mr-1 h-4 w-4" /> Verificar</>
                          )}
                        </DSButton>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="phone">Telefone *</Label>
                      <div className="flex gap-2">
                        <DSInput id="phone" required inputMode="tel" value={phone}
                          onChange={(e) => { setPhone(e.target.value); markDirty(); }}
                          placeholder="(11) 99999-9999" />
                        <DSButton type="button" variant="outline" size="sm" onClick={handleVerifyPhone}>
                          {phoneVerifiedAt ? (
                            <><BadgeCheck className="mr-1 h-4 w-4 text-primary" /> Verificado</>
                          ) : (
                            <><PhoneCall className="mr-1 h-4 w-4" /> Verificar</>
                          )}
                        </DSButton>
                      </div>
                    </div>

                    <SectionTitle>Contato de emergência</SectionTitle>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="emerg_name">Nome</Label>
                        <DSInput id="emerg_name" value={emergencyName}
                          onChange={(e) => { setEmergencyName(e.target.value); markDirty(); }}
                          placeholder="Ex: Maria" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="emerg_phone">Telefone</Label>
                        <DSInput id="emerg_phone" inputMode="tel" value={emergencyPhone}
                          onChange={(e) => { setEmergencyPhone(e.target.value); markDirty(); }}
                          placeholder="(11) 99999-9999" />
                      </div>
                    </div>

                    <SectionTitle>Segurança</SectionTitle>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="new_password" className="flex items-center gap-1.5 text-sm">
                          <Lock className="h-3.5 w-3.5" /> Nova senha
                        </Label>
                        <DSInput id="new_password" type="password" autoComplete="new-password"
                          value={newPassword}
                          onChange={(e) => { setNewPassword(e.target.value); markDirty(); }}
                          placeholder="Mín. 6 caracteres" minLength={6} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="confirm_password" className="text-sm">Confirmar senha</Label>
                        <DSInput id="confirm_password" type="password" autoComplete="new-password"
                          value={confirmPassword}
                          onChange={(e) => { setConfirmPassword(e.target.value); markDirty(); }}
                          placeholder="Repita a nova senha" minLength={6} />
                      </div>
                    </div>

                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                      <DSButton type="button" variant="outline" onClick={cancelChanges} disabled={!dirty || saving}>
                        <X className="mr-2 h-4 w-4" /> Cancelar
                      </DSButton>
                      <DSButton type="submit" disabled={saving || !dirty} className="sm:min-w-[180px]">
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
                  <DSCardTitle className="flex items-center gap-2 text-base text-destructive">
                    <ShieldAlert className="h-5 w-5" /> Zona perigosa
                  </DSCardTitle>
                  <DSCardDescription>
                    Sua conta será marcada como excluída e você perderá acesso imediato.
                  </DSCardDescription>
                </DSCardHeader>
                <DSCardContent>
                  <DSButton type="button" variant="destructive" onClick={handleDeleteAccount}>
                    <Trash2 className="mr-2 h-4 w-4" /> Excluir minha conta
                  </DSButton>
                </DSCardContent>
              </DSCard>
            </>
          )}
        </div>
      </main>
      {nav && <BottomNav items={nav} />}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="border-b border-border pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}
