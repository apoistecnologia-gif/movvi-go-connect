import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Banknote, Bell, CreditCard, Info, KeyRound, Languages, LifeBuoy, Loader2,
  LockKeyhole, LogOut, MapPin, MapPinned, Moon, Navigation, Palette,
  QrCode, Save, Settings as SettingsIcon, Shield, ShieldCheck, Smartphone,
  Sun, Trash2, User, Vibrate, Volume2, FileText, Fingerprint,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requestPushPermission } from "@/lib/pushNotifications";
import {
  DEFAULT_DRIVER_PREFS, loadDriverPrefs, saveDriverPrefs, type DriverPrefs,
} from "@/lib/driverPrefs";
import { useTheme } from "@/lib/theme";
import {
  SettingsSection, SettingsToggleRow, SettingsLinkRow, SettingsRow, AppAboutCard,
  SettingsPageShell, SettingsHero,
} from "@/components/settings";
import { DSButton, DSLabel } from "@/design-system";

export const Route = createFileRoute("/motorista/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — APOIS" }] }),
  component: DriverSettingsPage,
});

function DriverSettingsPage() {
  const navigate = useNavigate();
  const { setMode } = useTheme();
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<DriverPrefs>(DEFAULT_DRIVER_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notifState, setNotifState] = useState<NotificationPermission | "unsupported" | null>(null);
  const [locState, setLocState] = useState<PermissionState | "unsupported" | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) { navigate({ to: "/motorista/login" }); return; }
      setUserId(data.user.id);
      setUserEmail(data.user.email ?? null);
      const p = await loadDriverPrefs(data.user.id);
      setPrefs(p);
      setLoading(false);
    })();

    if (typeof Notification !== "undefined") setNotifState(Notification.permission);
    else setNotifState("unsupported");
    if (navigator.permissions?.query) {
      navigator.permissions.query({ name: "geolocation" as PermissionName })
        .then((s) => { setLocState(s.state); s.onchange = () => setLocState(s.state); })
        .catch(() => setLocState(null));
    } else if (!navigator.geolocation) setLocState("unsupported");
  }, [navigate]);

  function update<K extends keyof DriverPrefs>(key: K, value: DriverPrefs[K]) {
    setPrefs((p) => ({ ...p, [key]: value }));
    if (key === "theme") setMode(value as DriverPrefs["theme"]);
  }

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    try {
      await saveDriverPrefs(userId, prefs);
      toast.success("Configurações salvas!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally { setSaving(false); }
  }

  async function handleEnablePush() {
    const r = await requestPushPermission();
    setNotifState(r);
    if (r === "granted") {
      update("push", true);
      toast.success("Notificações ativadas.");
    } else {
      toast.error("Permissão não concedida.");
    }
  }

  async function handleTestLocation() {
    if (!navigator.geolocation) { toast.error("Geolocalização indisponível."); return; }
    navigator.geolocation.getCurrentPosition(
      () => { setLocState("granted"); toast.success("Localização OK."); },
      () => { setLocState("denied"); toast.error("Permissão negada."); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function handleClearCache() {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith("movvi:") && !k.includes("prefs"));
    keys.forEach((k) => localStorage.removeItem(k));
    toast.success(`Cache limpo (${keys.length} itens).`);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/motorista/login" });
  }

  async function handleLogoutAll() {
    await supabase.auth.signOut({ scope: "global" });
    toast.success("Sessão encerrada em todos os dispositivos.");
    navigate({ to: "/motorista/login" });
  }

  return (
    <SettingsPageShell variant="driver">
      <SettingsHero
        icon={SettingsIcon}
        title="Configurações"
        subtitle="Personalize seu app e preferências."
      />

          {loading ? (
            <div className="flex items-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : (
            <>
              {/* Conta */}
              <SettingsSection icon={User} title="Conta" description={userEmail ?? undefined}>
                <SettingsLinkRow icon={User} title="Perfil" hint="Foto, nome e dados pessoais" to="/motorista/perfil" />
                <SettingsLinkRow icon={Smartphone} title="Telefone e e-mail" hint="Atualize seus contatos" to="/motorista/perfil" />
                <SettingsLinkRow icon={LogOut} title="Sair" onClick={handleLogout} />
                <SettingsLinkRow icon={Trash2} title="Excluir conta" hint="Em breve" destructive onClick={() => toast.message("Exclusão de conta em breve.")} />
              </SettingsSection>

              {/* Segurança */}
              <SettingsSection icon={ShieldCheck} title="Segurança">
                <SettingsLinkRow icon={KeyRound} title="Alterar senha" to="/motorista/seguranca" />
                <SettingsLinkRow icon={Shield} title="Sessões ativas" hint="Em breve" onClick={() => toast.message("Sessões ativas em breve.")} />
                <SettingsLinkRow icon={Fingerprint} title="Autenticação biométrica" hint="Em breve" onClick={() => toast.message("Biometria em breve.")} />
                <SettingsLinkRow icon={LockKeyhole} title="Bloqueio por PIN" hint="Em breve" onClick={() => toast.message("PIN em breve.")} />
                <SettingsLinkRow icon={LogOut} title="Sair de todos os dispositivos" destructive onClick={handleLogoutAll} />
              </SettingsSection>

              {/* Notificações */}
              <SettingsSection icon={Bell} title="Notificações" description="Alertas e canais de aviso.">
                <SettingsToggleRow icon={Bell} title="Notificações push" checked={prefs.push} onChange={(v) => v ? handleEnablePush() : update("push", false)} />
                <SettingsToggleRow title="Alertas de corrida" hint="Novas corridas, atualizações e lembretes" checked={prefs.ride_alerts} onChange={(v) => update("ride_alerts", v)} />
                <SettingsToggleRow icon={Volume2} title="Som" checked={prefs.sound} onChange={(v) => update("sound", v)} />
                <SettingsToggleRow icon={Vibrate} title="Vibração" checked={prefs.vibration} onChange={(v) => update("vibration", v)} />
                <SettingsLinkRow icon={Bell} title="Central de notificações" to="/motorista/notificacoes" />
              </SettingsSection>

              {/* Corridas */}
              <SettingsSection icon={MapPinned} title="Corridas" description="Preferências de aceitação.">
                <SettingsToggleRow title="Aceitar corridas curtas" checked={prefs.accept_short} onChange={(v) => update("accept_short", v)} />
                <SettingsToggleRow title="Aceitar corridas longas" checked={prefs.accept_long} onChange={(v) => update("accept_long", v)} />
                <div className="space-y-2 py-3">
                  <div className="flex items-center justify-between">
                    <DSLabel className="text-sm">Raio máximo de busca</DSLabel>
                    <span className="rounded-md bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary ring-1 ring-primary/30">
                      {prefs.max_radius_km} km
                    </span>
                  </div>
                  <Slider value={[prefs.max_radius_km]} min={1} max={50} step={1} onValueChange={(v) => update("max_radius_km", v[0] ?? 10)} />
                </div>
              </SettingsSection>

              {/* Pagamentos aceitos */}
              <SettingsSection icon={CreditCard} title="Formas de pagamento aceitas">
                <SettingsToggleRow icon={Banknote} title="Dinheiro" checked={prefs.accept_cash} onChange={(v) => update("accept_cash", v)} />
                <SettingsToggleRow icon={QrCode} title="Pix" checked={prefs.accept_pix} onChange={(v) => update("accept_pix", v)} />
                <SettingsToggleRow icon={CreditCard} title="Maquininha" checked={prefs.accept_card} onChange={(v) => update("accept_card", v)} />
              </SettingsSection>

              {/* Aplicativo */}
              <SettingsSection icon={Palette} title="Aplicativo">
                <SettingsRow
                  icon={Moon}
                  title="Tema"
                  right={
                    <div className="grid grid-cols-3 gap-1.5">
                      <ThemeBtn icon={<Sun className="h-3.5 w-3.5" />} label="Claro" active={prefs.theme === "light"} onClick={() => update("theme", "light")} />
                      <ThemeBtn icon={<Moon className="h-3.5 w-3.5" />} label="Escuro" active={prefs.theme === "dark"} onClick={() => update("theme", "dark")} />
                      <ThemeBtn label="Auto" active={prefs.theme === "system"} onClick={() => update("theme", "system")} />
                    </div>
                  }
                />
                <SettingsRow
                  icon={Navigation}
                  title="App de navegação"
                  hint="Aplicativo aberto ao iniciar corrida"
                  right={
                    <select
                      value={prefs.navigation_app}
                      onChange={(e) => update("navigation_app", e.target.value as DriverPrefs["navigation_app"])}
                      className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="internal">Interna</option>
                      <option value="google">Google Maps</option>
                      <option value="waze">Waze</option>
                    </select>
                  }
                />
                <SettingsRow
                  icon={Languages}
                  title="Idioma"
                  hint="Em breve"
                  right={
                    <select
                      value={prefs.language}
                      onChange={(e) => update("language", e.target.value as DriverPrefs["language"])}
                      className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="pt">Português</option>
                      <option value="en">English</option>
                      <option value="es">Español</option>
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
                  hint={locState === "granted" ? "Permitida" : locState === "denied" ? "Bloqueada — ajuste no navegador" : locState === "unsupported" ? "Indisponível" : "Pendente"}
                  right={<DSButton size="sm" variant="outline" onClick={handleTestLocation}>Testar</DSButton>}
                />
                <SettingsRow
                  icon={Bell}
                  title="Permissão de notificações"
                  hint={notifState === "granted" ? "Permitida" : notifState === "denied" ? "Bloqueada" : notifState === "unsupported" ? "Indisponível" : "Pendente"}
                  right={<DSButton size="sm" variant="outline" onClick={handleEnablePush}>Solicitar</DSButton>}
                />
                <SettingsLinkRow icon={FileText} title="Termos de Uso" to="/motorista/termos" />
                <SettingsLinkRow icon={ShieldCheck} title="Política de Privacidade" to="/motorista/privacidade" />
              </SettingsSection>

              {/* Suporte */}
              <SettingsSection icon={LifeBuoy} title="Suporte">
                <SettingsLinkRow icon={LifeBuoy} title="Central de ajuda" to="/motorista/suporte" />
                <SettingsLinkRow icon={LifeBuoy} title="Perguntas frequentes" to="/motorista/suporte" />
                <SettingsLinkRow icon={LifeBuoy} title="Falar com o suporte" to="/motorista/suporte" />
              </SettingsSection>

              <DSButton onClick={handleSave} disabled={saving} className="w-full">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar configurações
              </DSButton>

              {/* Sobre */}
              <SettingsSection icon={Info} title="Sobre">
                <div className="py-2"><AppAboutCard /></div>
              </SettingsSection>
            </>
          )}
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
