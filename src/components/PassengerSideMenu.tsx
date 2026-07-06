import { useEffect, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, ChevronDown, ClipboardList, FileText, HelpCircle, IdCard, Info, Loader2, Lock, Mail, Phone, Save, Settings, Shield, User as UserIcon, LogOut, Wallet } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ProfilePhotoUploader } from "@/components/ProfilePhotoUploader";
import { supabase } from "@/integrations/supabase/client";
import { DSButton, DSInput, DSLabel } from "@/design-system";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogout?: () => void;
};

export function PassengerSideMenu({ open, onOpenChange, onLogout }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [originalEmail, setOriginalEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [dadosOpen, setDadosOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMsg(null);
    setLoading(true);
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (!u) {
        setLoading(false);
        return;
      }
      const meta = (u.user_metadata ?? {}) as Record<string, string>;
      setUserId(u.id);
      setEmail(u.email ?? "");
      setOriginalEmail(u.email ?? "");
      setName(meta.full_name ?? meta.name ?? "");
      setPhone(meta.phone ?? u.phone ?? "");

      const { data: profile } = await supabase
        .from("users")
        .select("avatar_url, name, phone")
        .eq("auth_user_id", u.id)
        .maybeSingle();
      if (profile) {
        setPhotoUrl(profile.avatar_url ?? null);
        if (!meta.full_name && !meta.name && profile.name) setName(profile.name);
        if (!meta.phone && profile.phone) setPhone(profile.phone);
      }
      setLoading(false);
    })();
  }, [open]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const updates: {
        data: Record<string, string>;
        password?: string;
        email?: string;
      } = { data: { full_name: name, phone } };
      if (newPassword) {
        if (newPassword.length < 6) {
          throw new Error("A senha deve ter pelo menos 6 caracteres.");
        }
        updates.password = newPassword;
      }
      if (email && email !== originalEmail) updates.email = email;

      const { error } = await supabase.auth.updateUser(updates);
      if (error) throw error;

      if (userId) {
        await supabase
          .from("users")
          .update({ name, phone })
          .eq("auth_user_id", userId);
      }
      setNewPassword("");
      setMsg({
        kind: "ok",
        text:
          email !== originalEmail
            ? "Dados salvos! Confirme o novo e-mail pela caixa de entrada."
            : "Dados atualizados com sucesso!",
      });
    } catch (err) {
      setMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "Falha ao salvar.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoUploaded(result: { signedUrl: string; path: string }) {
    if (!userId) return;
    setPhotoUrl(result.signedUrl);
    try {
      await supabase
        .from("users")
        .update({ avatar_url: result.signedUrl })
        .eq("auth_user_id", userId);
      await supabase.auth.updateUser({ data: { avatar_url: result.signedUrl } });
      setMsg({ kind: "ok", text: "Foto de perfil atualizada!" });
    } catch (err) {
      setMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "Falha ao salvar a foto.",
      });
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
      await supabase.auth.updateUser({ data: { avatar_url: "" } });
      setPhotoUrl(null);
      setMsg({ kind: "ok", text: "Foto removida." });
    } catch (err) {
      setMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "Falha ao remover a foto.",
      });
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-[88vw] max-w-sm overflow-y-auto bg-background p-0"
      >
        <SheetHeader className="border-b border-border bg-card/60 px-5 py-4 text-left">
          <SheetTitle className="text-lg">Minha conta</SheetTitle>
          <SheetDescription className="text-xs">
            Atualize seus dados de perfil e segurança.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-5 py-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : (
            <>
              {userId && (
                <div className="flex justify-center">
                  <ProfilePhotoUploader
                    userId={userId}
                    name={name || email}
                    currentUrl={photoUrl}
                    onUploaded={handlePhotoUploaded}
                    onRemove={handlePhotoRemoved}
                    size={96}
                  />
                </div>
              )}

              <form onSubmit={onSave} className="space-y-4">
                <div className="space-y-1.5">
                  <DSLabel htmlFor="sm_name" className="flex items-center gap-1.5 text-xs">
                    <UserIcon className="h-3.5 w-3.5" /> Nome
                  </DSLabel>
                  <DSInput
                    id="sm_name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome"
                  />
                </div>

                <div className="space-y-1.5">
                  <DSLabel htmlFor="sm_phone" className="flex items-center gap-1.5 text-xs">
                    <Phone className="h-3.5 w-3.5" /> Telefone
                  </DSLabel>
                  <DSInput
                    id="sm_phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                    inputMode="tel"
                  />
                </div>

                <div className="space-y-1.5">
                  <DSLabel htmlFor="sm_email" className="flex items-center gap-1.5 text-xs">
                    <Mail className="h-3.5 w-3.5" /> E-mail
                  </DSLabel>
                  <DSInput
                    id="sm_email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@exemplo.com"
                  />
                  {email !== originalEmail && (
                    <p className="text-[11px] text-muted-foreground">
                      Será enviado um link de confirmação para o novo endereço.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5 rounded-lg border border-border bg-card/50 p-3">
                  <DSLabel htmlFor="sm_pwd" className="flex items-center gap-1.5 text-xs">
                    <Lock className="h-3.5 w-3.5" /> Nova senha (opcional)
                  </DSLabel>
                  <DSInput
                    id="sm_pwd"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Deixe em branco para não alterar"
                    minLength={6}
                  />
                </div>

                {msg && (
                  <div
                    className={`rounded-lg px-3 py-2 text-xs ${
                      msg.kind === "ok"
                        ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                        : "bg-destructive/15 text-destructive ring-1 ring-destructive/30"
                    }`}
                  >
                    {msg.text}
                  </div>
                )}

                <DSButton type="submit" disabled={saving} className="w-full">
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Salvar alterações
                </DSButton>
              </form>

              <div className="space-y-2 border-t border-border pt-4">
                <Link
                  to="/passageiro/corridas"
                  onClick={() => onOpenChange(false)}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-3 py-2.5 text-sm font-medium text-foreground transition hover:bg-accent/40"
                >
                  <ClipboardList className="h-4 w-4 text-primary" />
                  Minhas corridas
                </Link>
                <Link
                  to="/passageiro/carteira"
                  onClick={() => onOpenChange(false)}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-3 py-2.5 text-sm font-medium text-foreground transition hover:bg-accent/40"
                >
                  <Wallet className="h-4 w-4 text-primary" />
                  Minha carteira
                </Link>
                <Link
                  to="/passageiro/notificacoes"
                  onClick={() => onOpenChange(false)}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-3 py-2.5 text-sm font-medium text-foreground transition hover:bg-accent/40"
                >
                  <Bell className="h-4 w-4 text-primary" />
                  Notificações
                </Link>
                <Link
                  to="/passageiro/suporte"
                  onClick={() => onOpenChange(false)}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-3 py-2.5 text-sm font-medium text-foreground transition hover:bg-accent/40"
                >
                  <HelpCircle className="h-4 w-4 text-primary" />
                  Suporte
                </Link>
                <Link
                  to="/passageiro/sobre"
                  onClick={() => onOpenChange(false)}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-3 py-2.5 text-sm font-medium text-foreground transition hover:bg-accent/40"
                >
                  <Info className="h-4 w-4 text-primary" />
                  Sobre o app
                </Link>
                <Link
                  to="/passageiro/configuracoes"
                  onClick={() => onOpenChange(false)}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-3 py-2.5 text-sm font-medium text-foreground transition hover:bg-accent/40"
                >
                  <Settings className="h-4 w-4 text-primary" />
                  Configurações
                </Link>
                <Link
                  to="/passageiro/termos"
                  onClick={() => onOpenChange(false)}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-3 py-2.5 text-sm font-medium text-foreground transition hover:bg-accent/40 active:scale-[0.99]"
                >
                  <FileText className="h-4 w-4 text-primary" />
                  Termos de Uso
                </Link>
                <Link
                  to="/passageiro/privacidade"
                  onClick={() => onOpenChange(false)}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-3 py-2.5 text-sm font-medium text-foreground transition hover:bg-accent/40 active:scale-[0.99]"
                >
                  <Shield className="h-4 w-4 text-primary" />
                  Política de Privacidade
                </Link>

                {onLogout && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenChange(false);
                      onLogout();
                    }}
                    className="flex w-full items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive transition hover:bg-destructive/20"
                  >
                    <LogOut className="h-4 w-4" />
                    Sair
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
