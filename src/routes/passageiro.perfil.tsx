import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, PASSENGER_NAV, DRIVER_NAV } from "@/components/BottomNav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Save, Lock, MailCheck, PhoneCall, ShieldAlert, Trash2, BadgeCheck,
} from "lucide-react";
import { ProfilePhotoUploader } from "@/components/ProfilePhotoUploader";
import { toast } from "sonner";

export const Route = createFileRoute("/passageiro/perfil")({
  head: () => ({ meta: [{ title: "Perfil — MOVVI DRIVE" }] }),
  component: PerfilPassageiro,
});

function PerfilPassageiro() {
  return (
    <ProfilePage
      role="passenger"
      title="Meu perfil"
      description="Mantenha seus dados completos e atualizados."
    />
  );
}

export function ProfilePage({
  role,
  title,
  description,
}: {
  role: "passenger" | "driver";
  title: string;
  description: string;
}) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Auth-level
  const [email, setEmail] = useState("");
  const [emailVerifiedAt, setEmailVerifiedAt] = useState<string | null>(null);
  const [phoneVerifiedAt, setPhoneVerifiedAt] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Profile fields
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [city, setCity] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (!u) {
        setLoading(false);
        return;
      }
      setUserId(u.id);
      setEmail(u.email ?? "");

      const { data: profile } = await supabase
        .from("users")
        .select(
          "avatar_url, name, phone, cpf, birth_date, gender, emergency_contact_name, emergency_contact_phone, city, email_verified_at, phone_verified_at"
        )
        .eq("auth_user_id", u.id)
        .maybeSingle();

      if (profile) {
        setPhotoUrl(profile.avatar_url ?? null);
        setFullName(profile.name ?? "");
        setPhone(profile.phone ?? "");
        setCpf(profile.cpf ?? "");
        setBirthDate(profile.birth_date ?? "");
        setGender(profile.gender ?? "");
        setEmergencyName(profile.emergency_contact_name ?? "");
        setEmergencyPhone(profile.emergency_contact_phone ?? "");
        setCity(profile.city ?? "");
        setEmailVerifiedAt(profile.email_verified_at);
        setPhoneVerifiedAt(profile.phone_verified_at);
      }
      setLoading(false);
    })();
  }, []);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!userId) return;
    if (newPassword && newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }
    if (newPassword && newPassword.length < 6) {
      toast.error("Senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    setSaving(true);
    try {
      const { error: profErr } = await supabase
        .from("users")
        .update({
          name: fullName,
          phone,
          cpf: cpf || null,
          birth_date: birthDate || null,
          gender: gender || null,
          emergency_contact_name: emergencyName || null,
          emergency_contact_phone: emergencyPhone || null,
          city: city || null,
        })
        .eq("auth_user_id", userId);
      if (profErr) throw profErr;

      const authUpdate: { data?: Record<string, string>; password?: string } = {
        data: { full_name: fullName, phone, city },
      };
      if (newPassword) authUpdate.password = newPassword;
      const { error: authErr } = await supabase.auth.updateUser(authUpdate);
      if (authErr) throw authErr;

      toast.success("Perfil atualizado com sucesso!");
      setNewPassword("");
      setConfirmPassword("");
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
      const { error } = await supabase
        .from("users")
        .update({ avatar_url: result.signedUrl })
        .eq("auth_user_id", userId);
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
      const { error } = await supabase
        .from("users")
        .update({ avatar_url: null })
        .eq("auth_user_id", userId);
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
    if (!phone) {
      toast.error("Preencha o telefone antes de verificar.");
      return;
    }
    toast.info("Verificação por SMS em breve. Seu número foi marcado como pendente.");
  }

  async function handleDeleteAccount() {
    if (!userId) return;
    const ok = window.confirm(
      "Tem certeza? Sua conta será marcada para exclusão e você será desconectado."
    );
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
      <main className="flex-1 px-4 py-6 pb-24">
        <div className="container mx-auto max-w-2xl space-y-5">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando perfil...
            </div>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl">{title}</CardTitle>
                  <CardDescription>{description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={onSave} className="space-y-6">
                    {userId && (
                      <div className="flex flex-col items-center gap-2">
                        <ProfilePhotoUploader
                          userId={userId}
                          name={fullName || email}
                          currentUrl={photoUrl}
                          onUploaded={handlePhotoUploaded}
                          size={112}
                        />
                        <p className="text-xs text-muted-foreground">
                          JPG ou PNG. Mínimo 256×256px.
                        </p>
                      </div>
                    )}

                    <SectionTitle>Dados pessoais</SectionTitle>

                    <div className="space-y-1.5">
                      <Label htmlFor="full_name">Nome completo</Label>
                      <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Como devemos te chamar" />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="cpf">CPF</Label>
                        <Input id="cpf" value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="birth_date">Data de nascimento</Label>
                        <Input id="birth_date" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="gender">Gênero (opcional)</Label>
                        <select
                          id="gender"
                          value={gender}
                          onChange={(e) => setGender(e.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="">Prefiro não informar</option>
                          <option value="feminino">Feminino</option>
                          <option value="masculino">Masculino</option>
                          <option value="nao-binario">Não-binário</option>
                          <option value="outro">Outro</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="city">Cidade</Label>
                        <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Sua cidade" />
                      </div>
                    </div>

                    <SectionTitle>Contato</SectionTitle>
                    <div className="space-y-1.5">
                      <Label>E-mail</Label>
                      <div className="flex gap-2">
                        <Input value={email} disabled />
                        <Button type="button" variant="outline" size="sm" onClick={handleVerifyEmail}>
                          {emailVerifiedAt ? (
                            <><BadgeCheck className="mr-1 h-4 w-4 text-primary" /> Verificado</>
                          ) : (
                            <><MailCheck className="mr-1 h-4 w-4" /> Verificar</>
                          )}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="phone">Telefone</Label>
                      <div className="flex gap-2">
                        <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" />
                        <Button type="button" variant="outline" size="sm" onClick={handleVerifyPhone}>
                          {phoneVerifiedAt ? (
                            <><BadgeCheck className="mr-1 h-4 w-4 text-primary" /> Verificado</>
                          ) : (
                            <><PhoneCall className="mr-1 h-4 w-4" /> Verificar</>
                          )}
                        </Button>
                      </div>
                    </div>

                    <SectionTitle>Contato de emergência</SectionTitle>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="emerg_name">Nome</Label>
                        <Input id="emerg_name" value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} placeholder="Ex: Maria" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="emerg_phone">Telefone</Label>
                        <Input id="emerg_phone" value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} placeholder="(11) 99999-9999" />
                      </div>
                    </div>

                    <SectionTitle>Segurança</SectionTitle>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="new_password" className="flex items-center gap-1.5 text-sm">
                          <Lock className="h-3.5 w-3.5" /> Nova senha
                        </Label>
                        <Input id="new_password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mín. 6 caracteres" minLength={6} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="confirm_password" className="text-sm">Confirmar senha</Label>
                        <Input id="confirm_password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repita a nova senha" minLength={6} />
                      </div>
                    </div>

                    <Button type="submit" disabled={saving} className="w-full">
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Salvar alterações
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="border-destructive/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base text-destructive">
                    <ShieldAlert className="h-5 w-5" /> Zona perigosa
                  </CardTitle>
                  <CardDescription>
                    Sua conta será marcada como excluída e você perderá acesso imediato.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button type="button" variant="destructive" onClick={handleDeleteAccount}>
                    <Trash2 className="mr-2 h-4 w-4" /> Excluir minha conta
                  </Button>
                </CardContent>
              </Card>
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
