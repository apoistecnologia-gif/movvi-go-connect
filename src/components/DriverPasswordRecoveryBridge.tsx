import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { registerDriverPasswordRecoveryHandler } from "@/lib/auth/driverPasswordRecovery";

const DRIVER_PASSWORD_RESET_PATH = "/motorista/redefinir-senha";

export function DriverPasswordRecoveryBridge() {
  const router = useRouter();

  useEffect(() => {
    let dispose: (() => Promise<void>) | null = null;
    let alive = true;

    const openResetScreen = () => {
      if (!alive) return;
      // File-based route generation happens during the production build. Using
      // the history layer here avoids coupling the native deep-link bridge to a
      // potentially stale checked-in routeTree.gen.ts during the pre-build
      // typecheck, while still letting TanStack Router handle the location.
      router.history.push(DRIVER_PASSWORD_RESET_PATH);
    };

    void registerDriverPasswordRecoveryHandler({
      onReady: async () => {
        openResetScreen();
      },
      onError: async (reason) => {
        if (!alive) return;
        console.warn("[APOIS MOTORISTA] link de recuperação rejeitado", { reason });
        openResetScreen();
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
