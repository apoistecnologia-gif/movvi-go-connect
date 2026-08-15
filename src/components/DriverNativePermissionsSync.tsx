import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { requestPostAuthPermissions } from "@/lib/nativeBridge";

/**
 * Garante que push/FCM e permissões nativas sejam sincronizados somente quando
 * existe uma sessão autenticada. O root do app permanece montado durante o
 * login, então é necessário ouvir também mudanças de Auth para registrar o
 * dispositivo imediatamente após o sign-in.
 */
export function DriverNativePermissionsSync() {
  useEffect(() => {
    let active = true;

    const syncCurrentSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!active || error || !data.session) return;
      requestPostAuthPermissions();
    };

    void syncCurrentSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active || !session) return;
      window.setTimeout(() => {
        if (active) requestPostAuthPermissions();
      }, 0);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  return null;
}
