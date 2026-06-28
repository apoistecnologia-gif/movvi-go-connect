import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, PASSENGER_NAV } from "@/components/BottomNav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Bell, Volume2, Vibrate, Languages, Moon, Sun, MonitorSmartphone, MapPin,
  FileText, ShieldCheck, LifeBuoy, Info, LogOut, Loader2, Save,
} from "lucide-react";
import { toast } from "sonner";
import { requestPushPermission } from "@/lib/pushNotifications";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/passageiro/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — MOVVI DRIVE" }] }),
  component: ConfiguracoesPassageiro,
});

type Prefs = {
  push: boolean;
  ride_alerts: boolean;
  promo_alerts: boolean;
  sound: boolean;
  vibration: boolean;
  language: "pt-BR" | "en" | "es";
  theme: "dark" | "light" | "system";
};

const DEFAULT_PREFS: Prefs = {
  push: true,
  ride_alerts: true,
  promo_alerts: true,
  sound: true,
  vibration: true,
  language: "pt-BR",
  theme: "dark",
};

// Theme application is handled centrally by ThemeProvider (src/lib/theme.tsx).


function ConfiguracoesPassageiro() {
  const navigate = useNavigate();
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const [userId, setUserId] = useState<string | null>(null);
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
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((s) => {
          setGpsState(s.state);
          s.onchange = () => setGpsState(s.state);
        })
        .catch(() => setGpsState("unsupported"));
    } else {
      setGpsState("unsupported");
    }
  }, []);

  // Keep local prefs.theme in sync with active theme mode (provider is source of truth)
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
    if (ok) {
      toast.success("Notificações ativadas.");
      save({ ...prefs, push: true });
    } else {
      toast.error("Permissão negada pelo navegador.");
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MovviHeader logoutRedirect="/" />
      <main className="flex-1 px-4 py-6 pb-24">
        <div className="container mx-auto max-w-2xl space-y-5">
          <header>
            <h1 className="text-2xl font-bold">Configurações</h1>
            <p className="text-sm text-muted-foreground">
              Personalize notificações, tema, idioma e privacidade.
            </p>
            {saving && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Save className="h-3 w-3 animate-pulse" /> Salvando...
              </p>
            )}
          </header>

          {/* Notificações */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="h-4 w-4 text-primary" /> Notificações
              </CardTitle>
              <CardDescription>Controle de alertas do app.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Row label="Notificações push" hint="Receba avisos mesmo com o app fechado.">
                <div className="flex items-center gap-2">
                  {!prefs.push && (
                    <Button type="button" size="sm" variant="outline" onClick={handleEnablePush}>
                      Ativar
                    </Button>
                  )}
                  <Switch checked={prefs.push} onCheckedChange={(v) => save({ ...prefs, push: v })} />
                </div>
              </Row>
              <Row label="Alertas de corrida" hint="Aceite, chegada, início e fim.">
                <Switch checked={prefs.ride_alerts} onCheckedChange={(v) => save({ ...prefs, ride_alerts: v })} />
              </Row>
              <Row label="Promoções e novidades" hint="Cupons, ofertas e campanhas MOVVI.">
                <Switch checked={prefs.promo_alerts} onCheckedChange={(v) => save({ ...prefs, promo_alerts: v })} />
              </Row>
              <Row label={<span className="inline-flex items-center gap-1.5"><Volume2 className="h-3.5 w-3.5" /> Som</span>}>
                <Switch checked={prefs.sound} onCheckedChange={(v) => save({ ...prefs, sound: v })} />
              </Row>
              <Row label={<span className="inline-flex items-center gap-1.5"><Vibrate className="h-3.5 w-3.5" /> Vibração</span>}>
                <Switch checked={prefs.vibration} onCheckedChange={(v) => save({ ...prefs, vibration: v })} />
              </Row>
            </CardContent>
          </Card>

          {/* Idioma */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Languages className="h-4 w-4 text-primary" /> Idioma
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Label htmlFor="lang" className="sr-only">Idioma</Label>
              <select
                id="lang"
                value={prefs.language}
                onChange={(e) => save({ ...prefs, language: e.target.value as Prefs["language"] })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="pt-BR">Português (Brasil)</option>
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </CardContent>
          </Card>

          {/* Tema */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tema</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                <ThemeBtn active={themeMode === "light"} onClick={() => { setThemeMode("light"); save({ ...prefs, theme: "light" }); }} icon={<Sun className="h-4 w-4" />} label="Claro" />
                <ThemeBtn active={themeMode === "dark"} onClick={() => { setThemeMode("dark"); save({ ...prefs, theme: "dark" }); }} icon={<Moon className="h-4 w-4" />} label="Escuro" />
                <ThemeBtn active={themeMode === "system"} onClick={() => { setThemeMode("system"); save({ ...prefs, theme: "system" }); }} icon={<MonitorSmartphone className="h-4 w-4" />} label="Sistema" />
              </div>
            </CardContent>
          </Card>

          {/* Privacidade */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-primary" /> Privacidade
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Row label={<span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Permissão de localização</span>}
                hint={gpsState === "granted" ? "Permitida" : gpsState === "denied" ? "Negada — ajuste no navegador" : "Pendente"}
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigator.geolocation?.getCurrentPosition(() => toast.success("Localização OK"), () => toast.error("Localização indisponível"))}
                >
                  Testar
                </Button>
              </Row>
              <LinkRow to="/passageiro/termos" icon={FileText} label="Termos de Uso" />
              <LinkRow to="/passageiro/privacidade" icon={ShieldCheck} label="Política de Privacidade" />
            </CardContent>
          </Card>

          {/* Suporte */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <LifeBuoy className="h-4 w-4 text-primary" /> Suporte
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <LinkRow to="/passageiro/suporte" icon={LifeBuoy} label="Central de ajuda" />
              <LinkRow to="/passageiro/sobre" icon={Info} label="Sobre o MOVVI DRIVE" />
            </CardContent>
          </Card>

          <Button variant="destructive" className="w-full" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" /> Sair da conta
          </Button>
        </div>
      </main>
      <BottomNav items={PASSENGER_NAV} />
    </div>
  );
}

function Row({ label, hint, children }: { label: React.ReactNode; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function ThemeBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-xs transition ${
        active ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:bg-accent/40"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function LinkRow({ to, icon: Icon, label }: { to: string; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-lg border border-border bg-card/50 px-3 py-2.5 text-sm transition hover:bg-accent/40 active:scale-[0.99] active:bg-accent/60"
    >
      <Icon className="h-4 w-4 text-primary" />
      <span className="flex-1">{label}</span>
      <span className="text-muted-foreground">›</span>
    </Link>
  );
}
