import { useEffect, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bell,
  ClipboardList,
  Home,
  LifeBuoy,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Phone,
  Save,
  Settings,
  ShieldAlert,
  ShieldCheck,
  User as UserIcon,
  Wallet,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProfilePhotoUploader } from "@/components/ProfilePhotoUploader";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogout?: () => void;
};

const NAV_LINKS = [
  { to: "/motorista/app", label: "Início", icon: Home },
  { to: "/motorista/perfil", label: "Meu perfil", icon: UserIcon },
  { to: "/motorista/corridas", label: "Minhas corridas", icon: ClipboardList },
  { to: "/motorista/ganhos", label: "Financeiro", icon: Wallet },
  { to: "/motorista/notificacoes", label: "Notificações", icon: Bell },
  { to: "/motorista/seguranca", label: "Segurança & SOS", icon: ShieldAlert },
  { to: "/motorista/status", label: "Status do cadastro", icon: ShieldCheck },
  { to: "/motorista/suporte", label: "Central de ajuda", icon: LifeBuoy },
  { to: "/motorista/configuracoes", label: "Configurações", icon: Settings },
] as const;

export function DriverSideMenu({ open, onOpenChange, onLogout }: Props) {
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

      const { data: drv } = await supabase
        .from("drivers")
        .select("photo_url, name, phone")
        .eq("user_id", u.id)
        .maybeSingle();
      if (drv) {
        setPhotoUrl(drv.photo_url ?? null);
        if (!meta.full_name && !meta.name && drv.name) setName(drv.name);
        if (!meta.phone && drv.phone) setPhone(drv.phone);
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
        await Promise.all([
          supabase.from("users").update({ name, phone }).eq("auth_user_id", userId),
          supabase.from("drivers").update({ name, phone }).eq("user_id", userId),
        ]);
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
      await Promise.all([
        supabase.from("users").update({ avatar_url: result.signedUrl }).eq("auth_user_id", userId),
        supabase.from("drivers").update({ photo_url: result.signedUrl }).eq("user_id", userId),
        supabase.auth.updateUser({ data: { avatar_url: result.signedUrl } }),
      ]);
      setMsg({ kind: "ok", text: "Foto de perfil atualizada!" });
    } catch (err) {
      setMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "Falha ao salvar a foto.",
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
            Gerencie seu perfil, navegação e configurações.
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
                    size={96}
                    required
                  />
                </div>
              )}

              <form onSubmit={onSave} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="dm_name" className="flex items-center gap-1.5 text-xs">
                    <UserIcon className="h-3.5 w-3.5" /> Nome
                  </Label>
                  <Input
                    id="dm_name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="dm_phone" className="flex items-center gap-1.5 text-xs">
                    <Phone className="h-3.5 w-3.5" /> Telefone
                  </Label>
                  <Input
                    id="dm_phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                    inputMode="tel"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="dm_email" className="flex items-center gap-1.5 text-xs">
                    <Mail className="h-3.5 w-3.5" /> E-mail
                  </Label>
                  <Input
                    id="dm_email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@exemplo.com"
                  />
                  {email !== originalEmail && (
                    <p className="text-[11px] text-muted-foreground">
                      Você receberá um link de confirmação no novo endereço.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5 rounded-lg border border-border bg-card/50 p-3">
                  <Label htmlFor="dm_pwd" className="flex items-center gap-1.5 text-xs">
                    <Lock className="h-3.5 w-3.5" /> Nova senha (opcional)
                  </Label>
                  <Input
                    id="dm_pwd"
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

                <Button type="submit" disabled={saving} className="w-full">
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Salvar alterações
                </Button>
              </form>

              <nav className="space-y-1.5 border-t border-border pt-4">
                {NAV_LINKS.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => onOpenChange(false)}
                    className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-3 py-2.5 text-sm font-medium text-foreground transition hover:bg-accent/40 hover:ring-1 hover:ring-primary/30"
                  >
                    <item.icon className="h-4 w-4 text-primary" />
                    {item.label}
                  </Link>
                ))}

                {onLogout && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenChange(false);
                      onLogout();
                    }}
                    className="mt-2 flex w-full items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive transition hover:bg-destructive/20"
                  >
                    <LogOut className="h-4 w-4" />
                    Sair
                  </button>
                )}
              </nav>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
