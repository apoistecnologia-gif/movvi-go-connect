import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Save } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_PREFERENCES,
  fetchPreferences,
  savePreferences,
  type NotificationPreferences,
} from "@/lib/notifications/notificationPreferences";
import { invalidatePreferencesCache } from "@/lib/notifications/notificationService";
import { useNotificationPermission } from "@/hooks/useNotificationPermission";
import { DSButton } from "@/design-system";

type Row = {
  key: keyof NotificationPreferences;
  title: string;
  description: string;
};

const RIDE_ROWS: Row[] = [
  { key: "ride_updates", title: "Atualizações de corrida", description: "Motorista aceitou, chegou, iniciou, finalizou ou cancelou a corrida." },
  { key: "ride_requests", title: "Novos pedidos de corrida", description: "Alertas de solicitações disponíveis (motoristas)." },
  { key: "payment_reminders", title: "Pagamentos e assinatura", description: "Cobranças, vencimentos e bloqueios." },
  { key: "promotions", title: "Novidades e promoções", description: "Cupons, ofertas e comunicados." },
];

const CHANNEL_ROWS: Row[] = [
  { key: "sound", title: "Som", description: "Toque curto ao chegar uma notificação em primeiro plano." },
  { key: "vibration", title: "Vibração", description: "Vibrar o dispositivo (quando suportado)." },
];

export function NotificationPreferencesPage({ audience }: { audience: "passenger" | "driver" }) {
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const perm = useNotificationPermission();

  useEffect(() => {
    let alive = true;
    fetchPreferences()
      .then((p) => alive && setPrefs(p))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  function toggle(key: keyof NotificationPreferences) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
    setSaved(false);
  }

  async function onSave() {
    setSaving(true);
    try {
      await savePreferences(prefs);
      invalidatePreferencesCache();
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  const visibleRows = audience === "driver"
    ? RIDE_ROWS
    : RIDE_ROWS.filter((r) => r.key !== "ride_requests");

  return (
    <div className={audience === "driver" ? "mx-auto max-w-xl px-4 py-5 pb-4" : "container mx-auto max-w-xl px-4 py-6 pb-24"}>
      {audience !== "driver" ? (
        <header className="mb-5 flex items-center gap-3">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold">Preferências de notificação</h1>
            <p className="text-xs text-muted-foreground">Escolha o que deseja receber e como.</p>
          </div>
        </header>
      ) : null}

      <div className="mb-4 rounded-2xl border border-border bg-card/60 p-4">
        <div className="flex items-start gap-3">
          {perm.permission === "granted" ? (
            <Bell className="h-5 w-5 text-primary" />
          ) : (
            <BellOff className="h-5 w-5 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {perm.permission === "granted" && "Notificações ativadas"}
              {perm.permission === "denied" && "Notificações bloqueadas"}
              {perm.permission === "default" && "Notificações desativadas"}
              {perm.permission === "unsupported" && "Não suportado neste dispositivo"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {perm.permission === "granted" && "O app pode enviar alertas mesmo em segundo plano."}
              {perm.permission === "denied" && "Ative nas configurações do navegador para receber alertas."}
              {perm.permission === "default" && "Toque para ativar alertas do sistema."}
              {perm.permission === "unsupported" && "Você continuará vendo alertas dentro do app."}
            </p>
          </div>
          {perm.permission === "default" && (
            <DSButton size="sm" onClick={() => void perm.request()}>Ativar</DSButton>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Categorias</h2>
            {visibleRows.map((r) => (
              <PrefRow key={r.key} row={r} value={prefs[r.key]} onToggle={() => toggle(r.key)} />
            ))}
          </section>

          <section className="mt-6 space-y-2">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Alertas</h2>
            {CHANNEL_ROWS.map((r) => (
              <PrefRow key={r.key} row={r} value={prefs[r.key]} onToggle={() => toggle(r.key)} />
            ))}
          </section>

          <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
            {saved && <span className="text-xs text-primary">Preferências salvas</span>}
            <DSButton onClick={onSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar
            </DSButton>
          </div>
        </>
      )}
    </div>
  );
}

function PrefRow({ row, value, onToggle }: { row: Row; value: boolean; onToggle: () => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-2xl border border-border bg-card/60 p-4 transition hover:bg-card">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{row.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{row.description}</p>
      </div>
      <Switch checked={value} onCheckedChange={onToggle} />
    </label>
  );
}
