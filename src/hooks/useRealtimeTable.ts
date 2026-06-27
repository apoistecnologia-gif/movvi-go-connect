import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Assina mudanças realtime de uma tabela e dispara `onChange`.
 * Usar com cuidado dentro de useEffect — canal removido no unmount.
 */
export function useRealtimeTable(
  table: string,
  onChange: () => void,
  deps: unknown[] = [],
) {
  useEffect(() => {
    const channel = supabase
      .channel(`rt_${table}_${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => onChange(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, ...deps]);
}
