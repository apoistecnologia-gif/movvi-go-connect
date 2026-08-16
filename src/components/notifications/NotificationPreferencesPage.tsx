import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, BellOff, Loader2, RefreshCw, Save } from "lucide-react";
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

const DRIVER_ROWS: Row[] = [
  { key: "ride_updates", title: "Atualizações de corrida", description: "Mudanças de status das suas corridas em andamento e concluídas." },
  { key: "ride_requests", title: "Novos pedidos de corrida", description: "Alertas quando uma nova solicitação estiver disponível para você." },
  { key: "payment_reminders", title: "Pagamentos e mensalidade", description: "Avisos sobre mensalidade, carteira e outras movimentações da sua conta." },
  { key: "promotions", title: "Novidades e comunicados", description: "Comunicados e novidades relevantes da APOIS." },
];

const PASSENGER_ROWS: Row[] = [
  { key: "ride_updates", title: "Atualizações de corrida", description: "Avisos quando o motorista aceitar, chegar, iniciar ou finalizar sua corrida." },
  { key: "payment_reminders", title: "Pagamentos", description: "Avisos importantes sobre pagamentos, carteira e cobranças da sua conta." },
  { key: "promotions", title: "Novidades e comunicados", description: "Comunicados e novidades relevantes da APOIS." },
];

const CHANNEL_ROWS: Row[] = [
  { key: "sound", title: "Som", description: "Reproduzir som quando uma notificação chegar em primeiro plano." },
  { key: "vibration", title: "Vibração", description: "Vibrar o dispositivo quando houver suporte e permissão." },
];

function samePreferences(a: NotificationPreferences, b: NotificationPreferences): boolean {
  return (
    a.ride_updates === b.ride_updates &&
    a.ride_requests === b.ride_requests &&
    a.payment_reminders === b.payment_reminders &&
    a.promotions === b.promotions &&
    a.sound === b.sound &&
    a.vibration === b.vibration
  );
}

export function NotificationPreferencesPage({ audience }: { audience: "passenger" | "driver" }) {
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [savedPrefs, setSavedPrefs] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requestingPermission, setRequestingPermission] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const perm = useNotificationPermission();

  const visibleRows = audience === "driver" ? DRIVER_ROWS : PASSENGER_ROWS;
  const dirty = useMemo(() => !samePreferences(prefs, savedPrefs), [prefs, savedPrefs]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const loaded = await fetchPreferences();
      setPrefs(loaded);
      setSavedPrefs(loaded);
    } catch (caughtError: unknown) {
      console.error("[APOIS notifications] failed to load preferences", caughtError);
      setError("Não foi possível carregar suas preferências de notificação agora.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(key: keyof NotificationPreferences) {
    if (saving || loading) return;
    setPrefs((current) => ({ ...current, [key]: !current[key] }));
    setSaved(false);
    setError(null);
  }

  async function onSave(): Promise<void> {
    if (saving || loading || !dirty) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await savePreferences(prefs);
      invalidatePreferencesCache();
      setSavedPrefs(prefs);
      setSaved(true);
    } catch (caughtError: unknown) {
      console.error("[APOIS notifications] failed to save preferences", caughtError);
      setError("Não foi possível salvar suas preferências. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function requestPermission(): Promise<void> {
    if (requestingPermission) return;
    setRequestingPermission(true);
    setPermissionError(null);
    try {
      await perm.request();
    } catch (caughtError: unknown) {
      console.error("[APOIS notifications] permission request failed", caughtError);
      setPermissionError("Não foi possível solicitar a permissão de notificações agora.");
    } finally {
      setRequestingPermission(false);
    }
  }

  return (
    <div className={audience === "driver" ? "mx-auto min-w-0 max-w-xl px-4 py-5 pb-4" : "container mx-auto min-w-0 max-w-xl px-4 py-6 pb-24"}>
      {audience !== "driver" ? (
        <header className="mb-5 flex min-w-0 items-start gap-3">
          <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary" aria-hidden="true">
            <Bell className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="break-words font-display text-xl font-bold">Preferências de notificação</h1>
            <p className="mt-1 break-words text-sm leading-5 text-muted-foreground">Escolha o que deseja receber e como.</p>
          </div>
        </header>
      ) : null}

      <section className="mb-4 min-w-0 rounded-2xl border border-border bg-card/60 p-4" aria-label="Permissão de notificações">
        <div className="flex min-w-0 flex-wrap items-start gap-3">
          {perm.permission === "granted" ? (
            <Bell className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          ) : (
            <BellOff className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <div className="min-w-[180px] flex-1">
            <p className="break-words text-sm font-semibold">
              {perm.permission === "granted" && "Notificações ativadas"}
              {perm.permission === "denied" && "Notificações bloqueadas"}
              {perm.permission === "default" && "Notificações desativadas"}
              {perm.permission === "unsupported" && "Notificações do sistema indisponíveis"}
            </p>
            <p className="mt-1 break-words text-sm leading-5 text-muted-foreground">
              {perm.permission === "granted" && "O app pode enviar alertas mesmo quando estiver em segundo plano."}
              {perm.permission === "denied" && "Ative as notificações nas configurações do dispositivo para receber alertas."}
              {perm.permission === "default" && "Ative a permissão do sistema para receber alertas importantes."}
              {perm.permission === "unsupported" && "Você continuará vendo avisos disponíveis dentro do app."}
            </p>
          </div>
          {perm.permission === "default" ? (
            <DSButton
              size="sm"
              onClick={() => void requestPermission()}
              disabled={requestingPermission}
              aria-busy={requestingPermission}
              className="min-h-11 max-[339px]:w-full"
            >
              {requestingPermission ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
              {requestingPermission ? "Ativando..." : "Ativar"}
            </DSButton>
          ) : null}
        </div>
        {permissionError ? <p className="mt-3 break-words text-sm leading-5 text-red-300" role="alert">{permissionError}</p> : null}
      </section>

      {error ? (
        <div className="mb-4 min-w-0 rounded-2xl border border-red-500/20 bg-red-500/8 p-4" role="alert" aria-live="assertive">
          <div className="flex min-w-0 items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" aria-hidden="true" />
            <p className="min-w-0 flex-1 break-words text-sm leading-5 text-red-200">{error}</p>
          </div>
          {!saving ? (
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-300/20 px-4 text-sm font-bold text-red-100 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
            >
              <RefreshCw className={loading ? "h-4 w-4 animate-spin motion-reduce:animate-none" : "h-4 w-4"} aria-hidden="true" />
              Tentar novamente
            </button>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
          <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <span>Carregando preferências...</span>
        </div>
      ) : error && !dirty ? null : (
        <>
          <section className="space-y-2" aria-labelledby="notification-category-heading">
            <h2 id="notification-category-heading" className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Categorias</h2>
            {visibleRows.map((row) => (
              <PrefRow key={row.key} row={row} value={prefs[row.key]} onToggle={() => toggle(row.key)} disabled={saving} />
            ))}
          </section>

          <section className="mt-6 space-y-2" aria-labelledby="notification-channel-heading">
            <h2 id="notification-channel-heading" className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Alertas no aparelho</h2>
            {CHANNEL_ROWS.map((row) => (
              <PrefRow key={row.key} row={row} value={prefs[row.key]} onToggle={() => toggle(row.key)} disabled={saving} />
            ))}
          </section>

          <div className="mt-6 flex min-w-0 flex-wrap items-center justify-end gap-3">
            <span className="min-w-0 flex-1 break-words text-sm text-muted-foreground" aria-live="polite">
              {saved ? "Preferências salvas." : dirty ? "Há alterações ainda não salvas." : "Preferências atualizadas."}
            </span>
            <DSButton onClick={() => void onSave()} disabled={saving || !dirty} aria-busy={saving} className="min-h-11 max-[339px]:w-full">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save className="mr-2 h-4 w-4" aria-hidden="true" />}
              {saving ? "Salvando..." : "Salvar"}
            </DSButton>
          </div>
        </>
      )}
    </div>
  );
}

function PrefRow({ row, value, onToggle, disabled }: { row: Row; value: boolean; onToggle: () => void; disabled: boolean }) {
  const titleId = `notification-pref-${row.key}-title`;
  const descriptionId = `notification-pref-${row.key}-description`;

  return (
    <div className="flex min-w-0 items-start justify-between gap-3 rounded-2xl border border-border bg-card/60 p-4 transition hover:bg-card">
      <div className="min-w-0 flex-1">
        <p id={titleId} className="break-words text-sm font-semibold">{row.title}</p>
        <p id={descriptionId} className="mt-1 break-words text-sm leading-5 text-muted-foreground">{row.description}</p>
      </div>
      <Switch
        checked={value}
        onCheckedChange={() => onToggle()}
        disabled={disabled}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="shrink-0"
      />
    </div>
  );
}