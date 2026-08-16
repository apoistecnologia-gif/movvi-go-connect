import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
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
  const [signingOut, setSigningOut] = useState(false);
  const [requestingPush, setRequestingPush] = useState(false);
  const [testingLocation, setTestingLocation] = useState(false);
  const [notifState, setNotifState] = useState<NotificationPermission | "unsupported" | null>(null);
  const [locState, setLocState] = useState<PermissionState | "unsupported" | null>(null);

  useEffect(() => {
    let alive = true;
    let permissionStatus: PermissionStatus | null = null;

    void (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!alive) return;
        if (error || !data?.user) {
          if (error && import.meta.env.DEV) console.warn("[APOIS Settings] sessão indisponível", error);
          await navigate({ to: "/motorista/login", replace: true });
          return;
        }
        setUserId(data.user.id);
        setUserEmail(data.user.email?.trim() || null);
        const loadedPrefs = await loadDriverPrefs(data.user.id);
        if (!alive) return;
        setPrefs(loadedPrefs);
      } catch (error) {
        if (import.meta.env.DEV) console.warn("[APOIS Settings] falha ao carregar configurações", error);
        if (alive) toast.error("Não foi possível carregar as configurações agora.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    if (typeof Notification !== "undefined") setNotifState(Notification.permission);
    else setNotifState("unsupported");

    if (typeof navigator !== "undefined" && navigator.permissions?.query) {
      void navigator.permissions.query({ name: "geolocation" as PermissionName })
        .then((status) => {
          if (!alive) return;
          permissionStatus = status;
          setLocState(status.state);
          status.onchange = () => {
            if (alive) setLocState(status.state);
          };
        })
        .catch(() => {
          if (alive) setLocState(null);
        });
    } else if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocState("unsupported");
    }

    return () => {
      alive = false;
      if (permissionStatus) permissionStatus.onchange = null;
    };
  }, [navigate]);

  function update<K extends keyof DriverPrefs>(key: K, value: DriverPrefs[K]) {
    setPrefs((current) => ({ ...current, [key]: value }));
    if (key === "theme") setMode(value as DriverPrefs["theme"]);
  }

  async function handleSave() {
    if (!userId || saving) return;
    setSaving(true);
    try {
      await saveDriverPrefs(userId, prefs);
      toast.success("Configurações salvas neste dispositivo.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar as configurações.");
    } finally {
      setSaving(false);
    }
  }

  async function handleEnablePush() {
    if (requestingPush) return;
    setRequestingPush(true);
    try {
      const result = await requestPushPermission();
      setNotifState(result);
      if (result === "granted") {
        update("push", true);
        toast.success("Notificações ativadas.");
      } else if (result === "denied") {
        update("push", false);
        toast.error("A permissão de notificações está bloqueada nas configurações do aparelho.");
      } else {
        toast.error("Permissão de notificações não concedida.");
      }
    } catch (error) {
      if (import.meta.env.DEV) console.warn("[APOIS Settings] falha ao solicitar notificações", error);
      toast.error("Não foi possível solicitar a permissão de notificações agora.");
    } finally {
      setRequestingPush(false);
    }
  }

  function handleTestLocation() {
    if (testingLocation) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocState("unsupported");
      toast.error("Geolocalização indisponível.");
      return;
    }
    setTestingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setTestingLocation(false);
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
          toast.error("O aparelho retornou uma localização inválida.");
          return;
        }
        setLocState("granted");
        toast.success("Localização disponível.");
      },
      (error) => {
        setTestingLocation(false);
        if (error.code === error.PERMISSION_DENIED) setLocState("denied");
        toast.error(error.code === error.PERMISSION_DENIED ? "Permissão de localização negada." : "Não foi possível obter sua localização agora.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  function handleClearCache() {
    try {
      const keys = Object.keys(localStorage).filter((key) =>
        (key.startsWith("movvi:") || key.startsWith("apois:")) && !key.includes(":prefs:"),
      );
      keys.forEach((key) => localStorage.removeItem(key));
      toast.success(`Cache limpo (${keys.length} ${keys.length === 1 ? "item" : "itens"}).`);
    } catch (error) {
      if (import.meta.env.DEV) console.warn("[APOIS Settings] falha ao limpar cache", error);
      toast.error("Não foi possível limpar o cache neste dispositivo.");
    }
  }

  async function handleLogout(scope: "local" | "global" = "local") {
    if (signingOut || deleting) return;
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut({ scope });
      if (error) throw error;
      if (scope === "global") toast.success("Sessão encerrada em todos os dispositivos.");
      await navigate({ to: "/motorista/login", replace: true });
    } catch (error) {
      if (import.meta.env.DEV) console.warn("[APOIS Settings] falha ao sair", error);
      toast.error(scope === "global" ? "Não foi possível encerrar as outras sessões agora." : "Não foi possível sair da conta agora.");
    } finally {
      setSigningOut(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleting || signingOut) return;
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
      await navigate({ to: "/motorista/login", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir sua conta agora.");
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
            <div className="flex min-h-40 items-center justify-center gap-2 rounded-[24px] border border-white/5 bg-[#0D0F11] py-12 text-zinc-500" role="status" aria-live="polite">
              <Loader2 className="h-5 w-5 animate-spin text-[#F6BE1C] motion-reduce:animate-none" aria-hidden="true" /> Carregando...
            </div>
          ) : (
            <>
              <SettingsSection icon={User} title="Conta" description={userEmail ?? undefined}>
                <SettingsLinkRow icon={User} title="Perfil" hint="Foto, nome e dados pessoais" to="/motorista/perfil" />
                <SettingsLinkRow icon={Smartphone} title="Telefone e e-mail" hint="Atualize seus contatos" to="/motorista/perfil" />
                <SettingsLinkRow icon={LogOut} title={signingOut ? "Saindo..." : "Sair"} onClick={() => void handleLogout("local")} />
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
                <SettingsLinkRow icon={LogOut} title={signingOut ? "Encerrando sessões..." : "Sair de todos os dispositivos"} destructive onClick={() => void handleLogout("global")} />
              </SettingsSection>

              <SettingsSection icon={Bell} title="Notificações" description="Alertas e canais de aviso deste aparelho.">
                <SettingsToggleRow icon={Bell} title="Notificações push" checked={prefs.push} onChange={(value) => value ? void handleEnablePush() : update("push", false)} />
                <SettingsToggleRow title="Alertas de corrida" hint="Novas corridas, atualizações e lembretes" checked={prefs.ride_alerts} onChange={(value) => update("ride_alerts", value)} />
                <SettingsToggleRow icon={Volume2} title="Som" checked={prefs.sound} onChange={(value) => update("sound", value)} />
                <SettingsToggleRow icon={Vibrate} title="Vibração" checked={prefs.vibration} onChange={(value) => update("vibration", value)} />
                <SettingsLinkRow icon={Bell} title="Central de notificações" to="/motorista/notificacoes" />
              </SettingsSection>

              <SettingsSection icon={Palette} title="Aplicativo">
                <SettingsRow
                  icon={Moon}
                  title="Tema"
                  right={
                    <div className="grid grid-cols-3 gap-1.5">
                      <ThemeBtn icon={<Sun className="h-3.5 w-3.5" aria-hidden="true" />} label="Claro" active={prefs.theme === "light"} onClick={() => update("theme", "light")} />
                      <ThemeBtn icon={<Moon className="h-3.5 w-3.5" aria-hidden="true" />} label="Escuro" active={prefs.theme === "dark"} onClick={() => update("theme", "dark")} />
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
                      onChange={(event) => update("navigation_app", event.target.value as DriverPrefs["navigation_app"])}
                      aria-label="Aplicativo de navegação preferido"
                      className="min-h-11 rounded-xl border border-white/8 bg-[#111315] px-3 text-sm font-semibold text-white outline-none focus-visible:border-[#F6BE1C]/55 focus-visible:ring-2 focus-visible:ring-[#F6BE1C]/40"
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
                      onChange={(event) => update("language", event.target.value as DriverPrefs["language"])}
                      aria-label="Idioma preferido"
                      className="min-h-11 rounded-xl border border-white/8 bg-[#111315] px-3 text-sm font-semibold text-white outline-none focus-visible:border-[#F6BE1C]/55 focus-visible:ring-2 focus-visible:ring-[#F6BE1C]/40"
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
                  hint={locState === "granted" ? "Permitida" : locState === "denied" ? "Bloqueada — ajuste nas configurações do aparelho" : locState === "unsupported" ? "Indisponível" : "Pendente"}
                  right={<DSButton size="sm" variant="outline" className="min-h-11" onClick={handleTestLocation} disabled={testingLocation} aria-busy={testingLocation}>{testingLocation ? "Testando..." : "Testar"}</DSButton>}
                />
                <SettingsRow
                  icon={Bell}
                  title="Permissão de notificações"
                  hint={notifState === "granted" ? "Permitida" : notifState === "denied" ? "Bloqueada" : notifState === "unsupported" ? "Indisponível" : "Pendente"}
                  right={<DSButton size="sm" variant="outline" className="min-h-11" onClick={() => void handleEnablePush()} disabled={requestingPush} aria-busy={requestingPush}>{requestingPush ? "Solicitando..." : "Solicitar"}</DSButton>}
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
                onClick={() => void handleSave()}
                disabled={saving || deleting || signingOut || !userId}
                aria-busy={saving}
                className="min-h-14 w-full rounded-[18px] bg-[#F6BE1C] text-[13px] font-black text-black shadow-[0_20px_46px_-24px_rgba(246,190,28,.85)] hover:brightness-105 focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save className="mr-2 h-4 w-4" aria-hidden="true" />}
                {saving ? "Salvando..." : "Salvar configurações"}
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

function ThemeBtn({ icon, label, active, onClick }: { icon?: ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-11 items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs font-bold transition active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F6BE1C]/60 motion-reduce:transform-none motion-reduce:transition-none ${
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
