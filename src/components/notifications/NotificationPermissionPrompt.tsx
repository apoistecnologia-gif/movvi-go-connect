import { Bell, X } from "lucide-react";
import { useNotificationPermission } from "@/hooks/useNotificationPermission";
import { DSButton } from "@/design-system";

/**
 * Polite in-app banner asking for push permission. Never appears immediately on
 * first load — waits a grace window and honors a 7-day dismissal. Rendering
 * this component anywhere in the app tree is a no-op unless the user is a
 * good candidate to be asked.
 */
export function NotificationPermissionPrompt() {
  const { shouldPrompt, request, dismiss, supported, permission } = useNotificationPermission();
  if (!supported || permission !== "default" || !shouldPrompt) return null;

  return (
    <div className="fixed inset-x-3 bottom-20 z-50 mx-auto max-w-md rounded-2xl border border-primary/40 bg-card/95 p-4 shadow-2xl backdrop-blur">
      <div className="flex items-start gap-3">
        <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Bell className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">Ativar notificações</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Receba alertas de corridas, pagamentos e atualizações importantes mesmo com o app em segundo plano.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <DSButton size="sm" onClick={() => void request()}>
              Ativar
            </DSButton>
            <DSButton size="sm" variant="ghost" onClick={dismiss}>
              Agora não
            </DSButton>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-lg p-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
