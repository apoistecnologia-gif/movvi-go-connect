import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { registerDriverPasswordRecoveryHandler } from "@/lib/auth/driverPasswordRecovery";

export function DriverPasswordRecoveryBridge() {
  const router = useRouter();

  useEffect(() => {
    let dispose: (() => Promise<void>) | null = null;
    let alive = true;

    void registerDriverPasswordRecoveryHandler({
      onReady: async () => {
        if (!alive) return;
        await router.navigate({ to: "/motorista/redefinir-senha" });
      },
      onError: async (reason) => {
        if (!alive) return;
        console.warn("[APOIS MOTORISTA] link de recuperação rejeitado", { reason });
        await router.navigate({ to: "/motorista/redefinir-senha" });
      },
    })
      .then((cleanup) => {
        if (!alive) {
          void cleanup();
          return;
        }
        dispose = cleanup;
      })
      .catch((error) => {
        console.warn("[APOIS MOTORISTA] listener de recuperação indisponível", {
          message: error instanceof Error ? error.message : "unknown_error",
        });
      });

    return () => {
      alive = false;
      if (dispose) void dispose();
    };
  }, [router]);

  return null;
}
