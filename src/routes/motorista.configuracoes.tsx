import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Bell, Info, KeyRound, Languages, LifeBuoy, Loader2,
  LockKeyhole, LogOut, MapPin, Moon, Navigation, Palette,
  Save, Settings as SettingsIcon, Shield, ShieldCheck, Smartphone,
  Sun, Trash2, User, Vibrate, Volume2, FileText, Fingerprint,
} from "lucide-react";
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
import { DSButton } from "@/design-system";

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
  const [deleting, setDeleting] = useState(false);
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
      toast.success("Configurações salvas neste dispositivo.");
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
    const keys = Object.keys(localStorage).filter((k) =>
      (k.startsWith("movvi:") || k.startsWith("apois:")) && !k.includes(":prefs:"),
    );
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

  async function handleDeleteAccount() {
    if (deleting) return;
    const confirmed = window.confirm(
      "Excluir sua conta APOIS Motorista permanentemente? Seus dados pessoais e documentos serão removidos. Corridas e registros que precisam ser preservados por segurança, auditoria ou obrigação legal poderão permanecer anonimizados. Se houver uma corrida ativa, a exclusão será bloqueada até ela ser finalizada ou cancelada.",
    );
    if (!confirmed) return;

    const phrase = window.prompt('Para confirmar a exclusão permanente, digite "EXCLUIR".');
    if (phrase?.trim().toUpperCase() !== "EXCLUIR") {
      toast.error("Exclusão cancelada: confirmação incorreta.");
      return;
    }

    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-my-account", { body: {} });
      if (error) {
        let message = "Não foi possível excluir sua conta agora.";
        const response = (error as { context?: Response }).context;
        if (response && typeof response.json === "function") {
          try {
            const body = await response.json() as { message?: string };
            if (body?.message) message = body.message;
          } catch {
            // resposta sem JSON; mantém a mensagem segura acima
          }
        }
        throw new Error(message);
      }
      if (!data?.ok) throw new Error(data?.message ?? "Não foi possível excluir sua conta agora.");

      try {
        Object.keys(localStorage)
          .filter((key) => key.startsWith("apois:") || key.startsWith("movvi:"))
          .forEach((key) => localStorage.removeItem(key));
      } catch {
        // limpeza local é best effort; a exclusão server-side já foi concluída
      }
      try { await supabase.auth.signOut({ scope: "local" }); } catch { /* sessão pode já ter sido invalidada */ }
      toast.success("Conta excluída com sucesso.");
      navigate({ to: "/motorista/login", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível excluir sua conta agora.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#050607] text-white">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_50%_0%,rgba(246,190,28,0.12),transparent_62%)]" />
      <div className="relative">
        <SettingsPageShell variant="driver">
          <div className="relative overflow-hidden rounded-[30px] border border-[#F6BE1C]/20 bg-gradient-to-br from-[#211A08] via-[#101214] to-[#08090A] p-1 shadow-[0_28px_78px_-42px_rgba(246,190,28,.8)]">
            <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-[#F6BE1C]/12 blur-3xl" />
            <div className="relative">
              <SettingsHero
                icon={SettingsIcon}
                title="Configurações"
                subtitle="Personalize o aplicativo neste dispositivo."
              />
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 rounded-[24px] border border-white/5 bg-[#0D0F11] py-12 text-zinc-500">
              <Loader2 className="h-5 w-5 animate-spin text-[#F6BE1C]" /> Carregando...
            </div>
          ) : (
            <>
              <SettingsSection icon={User} title="Conta" description={userEmail ?? undefined}>
                <SettingsLinkRow icon={User} title="Perfil" hint="Foto, nome e dados pessoais" to="/motorista/perfil" />
                <SettingsLinkRow icon={Smartphone} title="Telefone e e-mail" hint="Atualize seus contatos" to="/motorista/perfil" />
                <SettingsLinkRow icon={LogOut} title="Sair" onClick={handleLogout} />
                <SettingsLinkRow
                  icon={deleting ? Loader2 : Trash2}
                  title={deleting ? "Excluindo conta..." : "Excluir conta"}
                  hint="Exclusão permanente dos dados pessoais e documentos"
                  destructive
                  onClick={() => void handleDeleteAccount()}
                />
              </SettingsSection>

              <SettingsSection icon={ShieldCheck} title="Segurança">
                <SettingsLinkRow icon={KeyRound} title="Alterar senha" to="/motorista/seguranca" />
                <SettingsLinkRow icon={Shield} title="Sessões ativas" hint="Em breve" onClick={() => toast.message("Sessões ativas em breve.")} />
                <SettingsLinkRow icon={Fingerprint} title="Autenticação biométrica" hint="Em breve" onClick={() => toast.message("Biometria em breve.")} />
                <SettingsLinkRow icon={LockKeyhole} title="Bloqueio por PIN" hint="Em breve" onClick={() => toast.message("PIN em breve.")} />
                <SettingsLinkRow icon={LogOut} title="Sair de todos os dispositivos" destructive onClick={handleLogoutAll} />
              </SettingsSection>

              <SettingsSection icon={Bell} title="Notificações" description="Alertas e canais de aviso deste aparelho.">
                <SettingsToggleRow icon={Bell} title="Notificações push" checked={prefs.push} onChange={(v) => v ? handleEnablePush() : update("push", false)} />
                <SettingsToggleRow title="Alertas de corrida" hint="Novas corridas, atualizações e lembretes" checked={prefs.ride_alerts} onChange={(v) => update("ride_alerts", v)} />
                <SettingsToggleRow icon={Volume2} title="Som" checked={prefs.sound} onChange={(v) => update("sound", v)} />
                <SettingsToggleRow icon={Vibrate} title="Vibração" checked={prefs.vibration} onChange={(v) => update("vibration", v)} />
                <SettingsLinkRow icon={Bell} title="Central de notificações" to="/motorista/notificacoes" />
              </SettingsSection>

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
                      className="h-10 rounded-xl border border-white/8 bg-[#111315] px-3 text-xs font-semibold text-white outline-none focus:border-[#F6BE1C]/55"
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
                  hint="Preferência local de interface"
                  right={
                    <select
                      value={prefs.language}
                      onChange={(e) => update("language", e.target.value as DriverPrefs["language"])}
                      className="h-10 rounded-xl border border-white/8 bg-[#111315] px-3 text-xs font-semibold text-white outline-none focus:border-[#F6BE1C]/55"
                    >
                      <option value="pt">Português</option>
                      <option value="en">English</option>
                      <option value="es">Español</option>
                    </select>
                  }
                />
                <SettingsLinkRow icon={Trash2} title="Limpar cache do aplicativo" onClick={handleClearCache} />
              </SettingsSection>

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

              <SettingsSection icon={LifeBuoy} title="Suporte">
                <SettingsLinkRow icon={LifeBuoy} title="Central de ajuda" to="/motorista/suporte" />
                <SettingsLinkRow icon={LifeBuoy} title="Perguntas frequentes" to="/motorista/suporte" />
                <SettingsLinkRow icon={LifeBuoy} title="Falar com o suporte" to="/motorista/suporte" />
              </SettingsSection>

              <DSButton
                onClick={handleSave}
                disabled={saving}
                className="min-h-14 w-full rounded-[18px] bg-[#F6BE1C] text-[13px] font-black text-black shadow-[0_20px_46px_-24px_rgba(246,190,28,.85)] hover:brightness-105"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar configurações
              </DSButton>

              <SettingsSection icon={Info} title="Sobre">
                <div className="py-2"><AppAboutCard /></div>
              </SettingsSection>
            </>
          )}
        </SettingsPageShell>
      </div>
    </div>
  );
}

function ThemeBtn({ icon, label, active, onClick }: { icon?: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-9 items-center justify-center gap-1 rounded-xl border px-2 py-1.5 text-[11px] font-bold transition active:scale-[0.96] ${
        active
          ? "border-[#F6BE1C]/45 bg-[#F6BE1C]/12 text-[#F6BE1C] shadow-[0_10px_26px_-20px_rgba(246,190,28,.8)]"
          : "border-white/8 bg-[#111315] text-zinc-400 hover:border-white/12 hover:bg-[#15181B]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
