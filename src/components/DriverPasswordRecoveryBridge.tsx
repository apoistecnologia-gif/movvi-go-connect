import { useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";
import { registerDriverPasswordRecoveryHandler } from "@/lib/auth/driverPasswordRecovery";

const DRIVER_PASSWORD_RESET_PATH = "/motorista/redefinir-senha";

export function DriverPasswordRecoveryBridge() {
  const router = useRouter();
  const navigatingRef = useRef(false);
  const lastNavigationAtRef = useRef(0);

  useEffect(() => {
    let dispose: (() => Promise<void>) | null = null;
    let alive = true;
    let registrationSettled = false;

    const openResetScreen = () => {
      if (!alive || navigatingRef.current) return;
      const now = Date.now();
      if (now - lastNavigationAtRef.current < 750) return;
      lastNavigationAtRef.current = now;

      const currentPath = router.state.location.pathname;
      if (currentPath === DRIVER_PASSWORD_RESET_PATH) return;

      navigatingRef.current = true;
      try {
        router.history.push(DRIVER_PASSWORD_RESET_PATH);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn("[APOIS MOTORISTA] não foi possível abrir redefinição de senha", error);
        }
      } finally {
        window.setTimeout(() => {
          navigatingRef.current = false;
        }, 0);
      }
    };

    const registration = registerDriverPasswordRecoveryHandler({
      onReady: async () => {
        if (!alive) return;
        openResetScreen();
      },
      onError: async (reason) => {
        if (!alive) return;
        if (import.meta.env.DEV) {
          console.warn("[APOIS MOTORISTA] link de recuperação rejeitado", {
            reason: typeof reason === "string" ? reason.slice(0, 80) : "invalid_recovery_link",
          });
        }
        openResetScreen();
      },
    });

    void registration
      .then((cleanup) => {
        registrationSettled = true;
        if (typeof cleanup !== "function") {
          if (import.meta.env.DEV) {
            console.warn("[APOIS MOTORISTA] handler de recuperação não retornou cleanup válido");
          }
          return;
        }
        if (!alive) {
          void cleanup().catch((error) => {
            if (import.meta.env.DEV) {
              console.warn("[APOIS MOTORISTA] falha ao limpar listener de recuperação", error);
            }
          });
          return;
        }
        dispose = cleanup;
      })
      .catch((error) => {
        registrationSettled = true;
        if (!alive) return;
        if (import.meta.env.DEV) {
          console.warn("[APOIS MOTORISTA] listener de recuperação indisponível", {
            message: error instanceof Error ? error.message.slice(0, 120) : "unknown_error",
          });
        }
      });

    return () => {
      alive = false;
      navigatingRef.current = false;
      if (dispose) {
        const cleanup = dispose;
        dispose = null;
        void cleanup().catch((error) => {
          if (import.meta.env.DEV) {
            console.warn("[APOIS MOTORISTA] falha ao desmontar listener de recuperação", error);
          }
        });
      } else if (!registrationSettled) {
        // A promise de registro pode resolver depois do unmount; o bloco `then`
        // acima executará o cleanup imediatamente nesse caso.
      }
    };
  }, [router]);

  return null;
}
