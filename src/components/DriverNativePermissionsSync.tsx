import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadDriverPrefs } from "@/lib/driverPrefs";
import { requestPostAuthPermissions } from "@/lib/nativeBridge";

/**
 * Garante que permissões nativas sejam sincronizadas somente quando existe uma
 * sessão autenticada. O root do app permanece montado durante o login, então é
 * necessário ouvir também mudanças de Auth para registrar o dispositivo logo
 * após o sign-in. A preferência local de push é respeitada em cold start e ao
 * voltar do background; geolocalização continua sendo sincronizada sempre.
 */
export function DriverNativePermissionsSync() {
  useEffect(() => {
    let active = true;
    let pendingTimer: number | null = null;
    let lastSyncedUserId: string | null = null;

    const scheduleSync = (userId: string, force = false) => {
      const normalizedUserId = userId.trim();
      if (!active || !normalizedUserId) return;
      if (!force && lastSyncedUserId === normalizedUserId) return;
      if (pendingTimer != null) window.clearTimeout(pendingTimer);
      pendingTimer = window.setTimeout(() => {
        pendingTimer = null;
        if (!active) return;
        lastSyncedUserId = normalizedUserId;
        void loadDriverPrefs(normalizedUserId)
          .then((prefs) => requestPostAuthPermissions({ pushEnabled: prefs.push }))
          .catch((error) => {
            if (import.meta.env.DEV) console.warn("[APOIS] falha ao sincronizar permissões nativas", error);
          });
      }, 0);
    };

    const syncCurrentSession = async (force = false) => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!active) return;
        if (error) {
          if (import.meta.env.DEV) console.warn("[APOIS] sessão indisponível ao sincronizar permissões", error);
          return;
        }
        const userId = data.session?.user?.id;
        if (!userId) {
          lastSyncedUserId = null;
          return;
        }
        scheduleSync(userId, force);
      } catch (error) {
        if (import.meta.env.DEV) console.warn("[APOIS] falha ao sincronizar permissões nativas", error);
      }
    };

    void syncCurrentSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (!session?.user?.id) {
        lastSyncedUserId = null;
        if (pendingTimer != null) {
          window.clearTimeout(pendingTimer);
          pendingTimer = null;
        }
        return;
      }
      const force = event === "SIGNED_IN" || event === "USER_UPDATED";
      scheduleSync(session.user.id, force);
    });

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void syncCurrentSession();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      if (pendingTimer != null) window.clearTimeout(pendingTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      authListener.subscription.unsubscribe();
    };
  }, []);

  return null;
}