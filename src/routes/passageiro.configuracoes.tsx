import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PASSENGER_NAV } from "@/components/BottomNav";
import {
  Bell, Volume2, Vibrate, Languages, Moon, Sun, MonitorSmartphone, MapPin,
  FileText, ShieldCheck, LifeBuoy, Info, LogOut, Loader2, User, Smartphone,
  KeyRound, Shield, LockKeyhole, Fingerprint, Palette, Trash2, Navigation,
  Settings as SettingsIcon, Tag, Save,
} from "lucide-react";
import { toast } from "sonner";
import { requestPushPermission } from "@/lib/pushNotifications";
import { useTheme } from "@/lib/theme";
import {
import { DSButton } from "@/design-system";
  SettingsSection, SettingsToggleRow, SettingsLinkRow, SettingsRow, AppAboutCard,
  SettingsPageShell, SettingsHero,
} from "@/components/settings";

export const Route = createFileRoute("/passageiro/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — MOVVI" }] }),
  component: ConfiguracoesPassageiro,
});

type Prefs = {
  push: boolean;
  ride_alerts: boolean;
  promo_alerts: boolean;
  news_alerts: boolean;
  payment_reminders: boolean;
  sound: boolean;
  vibration: boolean;
  language: "pt-BR" | "en" | "es";
  theme: "dark" | "light" | "system";
  navigation_app: "internal" | "google" | "waze";
};

const DEFAULT_PREFS: Prefs = {
  push: true,
  ride_alerts: true,
  promo_alerts: true,
  news_alerts: false,
  payment_reminders: true,
  sound: true,
  vibration: true,
  language: "pt-BR",
  theme: "dark",
  navigation_app: "internal",
};

function ConfiguracoesPassageiro() {
  const navigate = useNavigate();
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gpsState, setGpsState] = useState<PermissionState | "unsupported">("prompt");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (u) {
        setUserId(u.id);
        setUserEmail(u.email ?? null);
        const { data: row } = await supabase
          .from("users")
          .select("preferences")
          .eq("auth_user_id", u.id)
          .maybeSingle();
        if (row?.preferences && typeof row.preferences === "object") {
          setPrefs({ ...DEFAULT_PREFS, ...(row.preferences as Partial<Prefs>) });
        }
      }
      setLoading(false);
    })();
    if (navigator.permissions?.query) {
      navigator.permissions.query({ name: "geolocation" as PermissionName })
        .then((s) => { setGpsState(s.state); s.onchange = () => setGpsState(s.state); })
        .catch(() => setGpsState("unsupported"));
    } else setGpsState("unsupported");
  }, []);

  useEffect(() => {
    if (prefs.theme !== themeMode) setPrefs((p) => ({ ...p, theme: themeMode }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeMode]);

  async function save(next: Prefs) {
    setPrefs(next);
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase
      .from("users")
      .update({ preferences: next })
      .eq("auth_user_id", userId);
    setSaving(false);
    if (error) toast.error("Falha ao salvar preferências.");
  }

  async function handleEnablePush() {
    const ok = (await requestPushPermission()) === "granted";
    if (ok) { toast.success("Notificações ativadas."); save({ ...prefs, push: true }); }
    else toast.error("Permissão negada pelo navegador.");
  }

  async function handleTestLocation() {
    navigator.geolocation?.getCurrentPosition(
      () => toast.success("Localização OK"),
      () => toast.error("Localização indisponível"),
    );
  }

  async function handleClearCache() {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith("movvi:") && !k.includes("prefs"));
    keys.forEach((k) => localStorage.removeItem(k));
    toast.success(`Cache limpo (${keys.length} itens).`);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  async function handleLogoutAll() {
    await supabase.auth.signOut({ scope: "global" });
    toast.success("Sessão encerrada em todos os dispositivos.");
    navigate({ to: "/" });
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#F7F9F7] text-[#707070]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando...
      </div>
    );
  }

  return (
    <SettingsPageShell nav={PASSENGER_NAV}>
      <SettingsHero
        icon={SettingsIcon}
        title="Configurações"
        subtitle={saving ? "Salvando…" : (userEmail ?? "Personalize sua conta MOVVI.")}
        action={saving ? <Save className="h-4 w-4 animate-pulse text-[#5A9A2A]" /> : undefined}
      />
      <div className="space-y-5">


          {/* Conta */}
          <SettingsSection icon={User} title="Conta" description={userEmail ?? undefined}>
            <SettingsLinkRow icon={User} title="Perfil" hint="Foto, nome e dados pessoais" to="/passageiro/perfil" />
            <SettingsLinkRow icon={Smartphone} title="Telefone e e-mail" hint="Atualize seus contatos" to="/passageiro/perfil" />
            <SettingsLinkRow icon={LogOut} title="Sair" onClick={handleLogout} />
            <SettingsLinkRow icon={Trash2} title="Excluir conta" hint="Em breve" destructive onClick={() => toast.message("Exclusão de conta em breve.")} />
          </SettingsSection>

          {/* Segurança */}
          <SettingsSection icon={ShieldCheck} title="Segurança">
            <SettingsLinkRow icon={KeyRound} title="Alterar senha" to="/passageiro/perfil" />
            <SettingsLinkRow icon={Shield} title="Sessões ativas" hint="Em breve" onClick={() => toast.message("Sessões ativas em breve.")} />
            <SettingsLinkRow icon={Fingerprint} title="Autenticação biométrica" hint="Em breve" onClick={() => toast.message("Biometria em breve.")} />
            <SettingsLinkRow icon={LockKeyhole} title="Bloqueio por PIN" hint="Em breve" onClick={() => toast.message("PIN em breve.")} />
            <SettingsLinkRow icon={LogOut} title="Sair de todos os dispositivos" destructive onClick={handleLogoutAll} />
          </SettingsSection>

          {/* Notificações */}
          <SettingsSection icon={Bell} title="Notificações" description="Escolha o que deseja receber.">
            <SettingsToggleRow icon={Bell} title="Notificações push" hint="Avisos mesmo com o app fechado" checked={prefs.push} onChange={(v) => v ? handleEnablePush() : save({ ...prefs, push: false })} />
            <SettingsToggleRow title="Atualizações da corrida" hint="Aceite, chegada, início e fim" checked={prefs.ride_alerts} onChange={(v) => save({ ...prefs, ride_alerts: v })} />
            <SettingsToggleRow icon={Tag} title="Promoções e cupons" checked={prefs.promo_alerts} onChange={(v) => save({ ...prefs, promo_alerts: v })} />
            <SettingsToggleRow title="Novidades MOVVI" checked={prefs.news_alerts} onChange={(v) => save({ ...prefs, news_alerts: v })} />
            <SettingsToggleRow title="Lembretes de pagamento" checked={prefs.payment_reminders} onChange={(v) => save({ ...prefs, payment_reminders: v })} />
            <SettingsToggleRow icon={Volume2} title="Som" checked={prefs.sound} onChange={(v) => save({ ...prefs, sound: v })} />
            <SettingsToggleRow icon={Vibrate} title="Vibração" checked={prefs.vibration} onChange={(v) => save({ ...prefs, vibration: v })} />
            <SettingsLinkRow icon={Bell} title="Central de notificações" to="/passageiro/notificacoes" />
          </SettingsSection>

          {/* Aplicativo */}
          <SettingsSection icon={Palette} title="Aplicativo">
            <SettingsRow
              icon={Moon}
              title="Tema"
              right={
                <div className="grid grid-cols-3 gap-1.5">
                  <ThemeBtn icon={<Sun className="h-3.5 w-3.5" />} label="Claro" active={themeMode === "light"} onClick={() => { setThemeMode("light"); save({ ...prefs, theme: "light" }); }} />
                  <ThemeBtn icon={<Moon className="h-3.5 w-3.5" />} label="Escuro" active={themeMode === "dark"} onClick={() => { setThemeMode("dark"); save({ ...prefs, theme: "dark" }); }} />
                  <ThemeBtn icon={<MonitorSmartphone className="h-3.5 w-3.5" />} label="Auto" active={themeMode === "system"} onClick={() => { setThemeMode("system"); save({ ...prefs, theme: "system" }); }} />
                </div>
              }
            />
            <SettingsRow
              icon={Languages}
              title="Idioma"
              hint="Em breve"
              right={
                <select
                  value={prefs.language}
                  onChange={(e) => save({ ...prefs, language: e.target.value as Prefs["language"] })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="pt-BR">Português</option>
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </select>
              }
            />
            <SettingsRow
              icon={Navigation}
              title="App de navegação preferido"
              right={
                <select
                  value={prefs.navigation_app}
                  onChange={(e) => save({ ...prefs, navigation_app: e.target.value as Prefs["navigation_app"] })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="internal">Interna</option>
                  <option value="google">Google Maps</option>
                  <option value="waze">Waze</option>
                </select>
              }
            />
            <SettingsLinkRow icon={Trash2} title="Limpar cache do aplicativo" onClick={handleClearCache} />
          </SettingsSection>

          {/* Privacidade */}
          <SettingsSection icon={Shield} title="Privacidade">
            <SettingsRow
              icon={MapPin}
              title="Permissão de localização"
              hint={gpsState === "granted" ? "Permitida" : gpsState === "denied" ? "Bloqueada — ajuste no navegador" : gpsState === "unsupported" ? "Indisponível" : "Pendente"}
              right={<DSButton size="sm" variant="outline" onClick={handleTestLocation}>Testar</DSButton>}
            />
            <SettingsLinkRow icon={FileText} title="Termos de Uso" to="/passageiro/termos" />
            <SettingsLinkRow icon={ShieldCheck} title="Política de Privacidade" to="/passageiro/privacidade" />
          </SettingsSection>

          {/* Suporte */}
          <SettingsSection icon={LifeBuoy} title="Suporte">
            <SettingsLinkRow icon={LifeBuoy} title="Central de ajuda" to="/passageiro/suporte" />
            <SettingsLinkRow icon={LifeBuoy} title="Perguntas frequentes" to="/passageiro/suporte" />
            <SettingsLinkRow icon={LifeBuoy} title="Falar com o suporte" to="/passageiro/suporte" />
          </SettingsSection>

          {/* Sobre */}
          <SettingsSection icon={Info} title="Sobre">
            <div className="py-2"><AppAboutCard /></div>
            <SettingsLinkRow icon={Info} title="Mais sobre a MOVVI" to="/passageiro/sobre" />
          </SettingsSection>
      </div>
    </SettingsPageShell>
  );
}

function ThemeBtn({ icon, label, active, onClick }: { icon?: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-[11px] font-medium transition active:scale-[0.96] ${
        active ? "border-primary bg-primary/15 text-primary" : "border-border bg-card/40 text-foreground hover:bg-accent/40"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
