import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Banknote, Bell, CreditCard, Globe, Languages, Loader2, MapPinned, Moon, Navigation,
  QrCode, Save, Settings as SettingsIcon, Shield, Sun, Trash2, Volume2, Vibrate,
} from "lucide-react";
import { MovviHeader } from "@/components/MovviHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requestPushPermission } from "@/lib/pushNotifications";
import { DEFAULT_DRIVER_PREFS, loadDriverPrefs, saveDriverPrefs, type DriverPrefs } from "@/lib/driverPrefs";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/motorista/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — MOVVI DRIVE" }] }),
  component: DriverSettingsPage,
});

function DriverSettingsPage() {
  const navigate = useNavigate();
  const { setMode } = useTheme();
  const [userId, setUserId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<DriverPrefs>(DEFAULT_DRIVER_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) { navigate({ to: "/motorista/login" }); return; }
      setUserId(data.user.id);
      const p = await loadDriverPrefs(data.user.id);
      setPrefs(p);
      setLoading(false);
    })();
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
      if (prefs.push) {
        const r = await requestPushPermission();
        if (r !== "granted") toast.warning("Permissão de notificações não concedida.");
      }
      toast.success("Configurações salvas!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally { setSaving(false); }
  }

  async function handleClearCache() {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith("movvi:") && !k.includes("prefs"));
    keys.forEach((k) => localStorage.removeItem(k));
    toast.success(`Cache do app limpo (${keys.length} itens).`);
  }

  async function handleLogoutAll() {
    await supabase.auth.signOut({ scope: "global" });
    toast.success("Sessão encerrada em todos os dispositivos.");
    navigate({ to: "/motorista/login" });
  }

  async function requestNotifPermission() {
    const r = await requestPushPermission();
    toast.info(r === "granted" ? "Notificações ativadas." : "Permissão negada pelo navegador.");
  }
  async function requestLocPermission() {
    if (!navigator.geolocation) { toast.error("GPS indisponível."); return; }
    navigator.geolocation.getCurrentPosition(
      () => toast.success("Localização permitida."),
      () => toast.error("Permissão negada."),
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background pb-10">
      <MovviHeader logoutRedirect="/" />
      <main className="flex-1 px-4 py-6">
        <div className="container mx-auto max-w-2xl space-y-5">
          <header className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/30">
              <SettingsIcon className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Configurações</h1>
              <p className="text-xs text-muted-foreground">Personalize seu app e preferências.</p>
            </div>
          </header>

          {loading ? (
            <div className="flex items-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : (
            <>
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Bell className="h-4 w-4 text-primary" /> Notificações</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <ToggleRow icon={<Bell className="h-4 w-4" />} label="Notificações push" checked={prefs.push} onChange={(v) => update("push", v)} />
                  <ToggleRow label="Alertas de corrida" checked={prefs.ride_alerts} onChange={(v) => update("ride_alerts", v)} />
                  <ToggleRow icon={<Volume2 className="h-4 w-4" />} label="Som" checked={prefs.sound} onChange={(v) => update("sound", v)} />
                  <ToggleRow icon={<Vibrate className="h-4 w-4" />} label="Vibração" checked={prefs.vibration} onChange={(v) => update("vibration", v)} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MapPinned className="h-4 w-4 text-primary" /> Corridas</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <ToggleRow label="Aceitar corridas curtas" checked={prefs.accept_short} onChange={(v) => update("accept_short", v)} />
                  <ToggleRow label="Aceitar corridas longas" checked={prefs.accept_long} onChange={(v) => update("accept_long", v)} />
                  <div className="space-y-2 rounded-lg border border-border bg-card/40 p-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Raio máximo de busca</Label>
                      <span className="rounded-md bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary ring-1 ring-primary/30">{prefs.max_radius_km} km</span>
                    </div>
                    <Slider value={[prefs.max_radius_km]} min={1} max={50} step={1} onValueChange={(v) => update("max_radius_km", v[0] ?? 10)} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4 text-primary" /> Pagamentos</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <ToggleRow icon={<Banknote className="h-4 w-4" />} label="Dinheiro" checked={prefs.accept_cash} onChange={(v) => update("accept_cash", v)} />
                  <ToggleRow icon={<QrCode className="h-4 w-4" />} label="Pix" checked={prefs.accept_pix} onChange={(v) => update("accept_pix", v)} />
                  <ToggleRow icon={<CreditCard className="h-4 w-4" />} label="Maquininha" checked={prefs.accept_card} onChange={(v) => update("accept_card", v)} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Moon className="h-4 w-4 text-primary" /> Aparência</CardTitle><CardDescription>Tema aplicado imediatamente em todo o app.</CardDescription></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2">
                    <ThemeBtn icon={<Sun className="h-4 w-4" />} label="Claro" active={prefs.theme === "light"} onClick={() => update("theme", "light")} />
                    <ThemeBtn icon={<Moon className="h-4 w-4" />} label="Escuro" active={prefs.theme === "dark"} onClick={() => update("theme", "dark")} />
                    <ThemeBtn icon={<Globe className="h-4 w-4" />} label="Sistema" active={prefs.theme === "system"} onClick={() => update("theme", "system")} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Navigation className="h-4 w-4 text-primary" /> Navegação</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2">
                    <ThemeBtn label="Interna" active={prefs.navigation_app === "internal"} onClick={() => update("navigation_app", "internal")} />
                    <ThemeBtn label="Google Maps" active={prefs.navigation_app === "google"} onClick={() => update("navigation_app", "google")} />
                    <ThemeBtn label="Waze" active={prefs.navigation_app === "waze"} onClick={() => update("navigation_app", "waze")} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Languages className="h-4 w-4 text-primary" /> Idioma</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2">
                    <ThemeBtn label="Português" active={prefs.language === "pt"} onClick={() => update("language", "pt")} />
                    <ThemeBtn label="English" active={prefs.language === "en"} onClick={() => update("language", "en")} />
                    <ThemeBtn label="Español" active={prefs.language === "es"} onClick={() => update("language", "es")} />
                  </div>
                </CardContent>
              </Card>

              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar configurações
              </Button>

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Shield className="h-4 w-4 text-primary" /> Privacidade & Conta</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="outline" onClick={requestLocPermission} className="w-full justify-start">Permissão de localização</Button>
                  <Button variant="outline" onClick={requestNotifPermission} className="w-full justify-start">Permissão de notificações</Button>
                  <Button variant="outline" onClick={handleClearCache} className="w-full justify-start"><Trash2 className="mr-2 h-4 w-4" /> Limpar cache</Button>
                  <Button asChild variant="outline" className="w-full justify-start"><Link to="/passageiro/termos">Termos de Uso</Link></Button>
                  <Button asChild variant="outline" className="w-full justify-start"><Link to="/passageiro/privacidade">Política de Privacidade</Link></Button>
                  <Button variant="outline" onClick={handleLogoutAll} className="w-full justify-start text-destructive hover:text-destructive">
                    Sair de todos os dispositivos
                  </Button>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function ToggleRow({ icon, label, checked, onChange }: { icon?: React.ReactNode; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card/40 p-3">
      <div className="flex items-center gap-3">
        {icon && <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-primary">{icon}</div>}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
function ThemeBtn({ icon, label, active, onClick }: { icon?: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-xs font-medium transition active:scale-[0.98] ${
        active ? "border-primary bg-primary/15 text-primary" : "border-border bg-card/40 text-foreground hover:bg-accent/40"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
