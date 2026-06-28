import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Banknote,
  Bell,
  CreditCard,
  Loader2,
  MapPinned,
  Moon,
  QrCode,
  Save,
  Settings as SettingsIcon,
  Trash2,
  Volume2,
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

export const Route = createFileRoute("/motorista/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — MOVVI DRIVE" }] }),
  component: DriverSettingsPage,
});

type Prefs = {
  pushEnabled: boolean;
  soundEnabled: boolean;
  acceptShortRides: boolean;
  acceptLongRides: boolean;
  acceptCash: boolean;
  acceptPix: boolean;
  acceptCard: boolean;
  maxRadiusKm: number;
  darkMode: boolean;
};

const DEFAULTS: Prefs = {
  pushEnabled: true,
  soundEnabled: true,
  acceptShortRides: true,
  acceptLongRides: true,
  acceptCash: true,
  acceptPix: true,
  acceptCard: true,
  maxRadiusKm: 10,
  darkMode: true,
};

const STORAGE_PREFIX = "movvi:driver:prefs:";

function loadPrefs(userId: string): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + userId);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    return DEFAULTS;
  }
}

function DriverSettingsPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (!u) {
        navigate({ to: "/motorista/login" });
        return;
      }
      setUserId(u.id);
      setPrefs(loadPrefs(u.id));
      setLoading(false);
    })();
  }, [navigate]);

  function update<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    setPrefs((p) => ({ ...p, [key]: value }));
  }

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    try {
      localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(prefs));
      if (prefs.pushEnabled) {
        const granted = await requestPushPermission();
        if (!granted) {
          toast.warning("Permissão de notificações não concedida pelo navegador.");
        }
      }
      toast.success("Configurações salvas!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    if (!userId) return;
    localStorage.removeItem(STORAGE_PREFIX + userId);
    setPrefs(DEFAULTS);
    toast.info("Configurações restauradas para o padrão.");
  }

  async function handleClearCache() {
    try {
      const keys = Object.keys(localStorage).filter(
        (k) => k.startsWith("movvi:") && !k.startsWith(STORAGE_PREFIX),
      );
      keys.forEach((k) => localStorage.removeItem(k));
      toast.success(`Cache do app limpo (${keys.length} itens).`);
    } catch {
      toast.error("Não foi possível limpar o cache.");
    }
  }

  async function handleLogoutAll() {
    await supabase.auth.signOut({ scope: "global" });
    toast.success("Sessão encerrada em todos os dispositivos.");
    navigate({ to: "/motorista/login" });
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
              <p className="text-xs text-muted-foreground">
                Personalize seu app, notificações e tipos de corrida.
              </p>
            </div>
          </header>

          {loading ? (
            <div className="flex items-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando preferências...
            </div>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Bell className="h-4 w-4 text-primary" /> Notificações
                  </CardTitle>
                  <CardDescription>Avisos de novas corridas e alertas.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ToggleRow
                    icon={<Bell className="h-4 w-4" />}
                    label="Notificações push"
                    description="Receba alertas quando uma corrida chegar."
                    checked={prefs.pushEnabled}
                    onChange={(v) => update("pushEnabled", v)}
                  />
                  <ToggleRow
                    icon={<Volume2 className="h-4 w-4" />}
                    label="Som de notificação"
                    description="Toque um alerta quando uma nova corrida for oferecida."
                    checked={prefs.soundEnabled}
                    onChange={(v) => update("soundEnabled", v)}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MapPinned className="h-4 w-4 text-primary" /> Corridas
                  </CardTitle>
                  <CardDescription>
                    Defina os tipos e a distância máxima das ofertas que você quer receber.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ToggleRow
                    label="Aceitar corridas curtas (até 3 km)"
                    description="Receba também viagens rápidas."
                    checked={prefs.acceptShortRides}
                    onChange={(v) => update("acceptShortRides", v)}
                  />
                  <ToggleRow
                    label="Aceitar corridas longas (acima de 20 km)"
                    description="Receba viagens com maior distância."
                    checked={prefs.acceptLongRides}
                    onChange={(v) => update("acceptLongRides", v)}
                  />

                  <div className="space-y-2 rounded-lg border border-border bg-card/40 p-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Raio máximo de busca</Label>
                      <span className="rounded-md bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary ring-1 ring-primary/30">
                        {prefs.maxRadiusKm} km
                      </span>
                    </div>
                    <Slider
                      value={[prefs.maxRadiusKm]}
                      min={1}
                      max={50}
                      step={1}
                      onValueChange={(v) => update("maxRadiusKm", v[0] ?? 10)}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      O sistema só te oferecerá corridas com origem dentro desse raio.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CreditCard className="h-4 w-4 text-primary" /> Pagamentos aceitos
                  </CardTitle>
                  <CardDescription>Escolha quais formas de pagamento aceitar.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ToggleRow
                    icon={<Banknote className="h-4 w-4" />}
                    label="Dinheiro"
                    checked={prefs.acceptCash}
                    onChange={(v) => update("acceptCash", v)}
                  />
                  <ToggleRow
                    icon={<QrCode className="h-4 w-4" />}
                    label="Pix"
                    checked={prefs.acceptPix}
                    onChange={(v) => update("acceptPix", v)}
                  />
                  <ToggleRow
                    icon={<CreditCard className="h-4 w-4" />}
                    label="Cartão (maquininha)"
                    checked={prefs.acceptCard}
                    onChange={(v) => update("acceptCard", v)}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Moon className="h-4 w-4 text-primary" /> Aparência
                  </CardTitle>
                  <CardDescription>Tema da interface do aplicativo.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ToggleRow
                    label="Modo escuro"
                    description="O MOVVI DRIVE usa tema escuro otimizado para dirigir à noite."
                    checked={prefs.darkMode}
                    onChange={(v) => update("darkMode", v)}
                  />
                </CardContent>
              </Card>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button onClick={handleSave} disabled={saving} className="flex-1">
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Salvar configurações
                </Button>
                <Button variant="outline" onClick={handleReset} disabled={saving}>
                  Restaurar padrão
                </Button>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Conta e dispositivo</CardTitle>
                  <CardDescription>Sessões e dados locais.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button
                    variant="outline"
                    onClick={handleClearCache}
                    className="w-full justify-start"
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Limpar cache do app
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleLogoutAll}
                    className="w-full justify-start text-destructive hover:text-destructive"
                  >
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

function ToggleRow({
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon?: React.ReactNode;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card/40 p-3">
      <div className="flex flex-1 items-start gap-3">
        {icon && (
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">{label}</div>
          {description && (
            <p className="text-[11px] text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
