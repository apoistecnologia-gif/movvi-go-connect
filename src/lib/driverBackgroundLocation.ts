import {
  isNativeAndroidDriverLocation,
  startNativeDriverLocation,
  stopNativeDriverLocation,
} from "@/lib/driverNativeLocation";

let authGuardStarted = false;

/**
 * Compatibilidade temporária para imports legados.
 *
 * O ciclo de vida do Foreground Service passou a ser controlado somente por
 * DriverPresenceKeeper + driverNativeLocation. Novos consumidores não devem
 * importar este módulo.
 */
export function ensureDriverBackgroundLocationAuthGuard(): void {
  // Mantido como no-op para não criar um segundo listener de autenticação que
  // possa disputar o start/stop do serviço nativo.
  authGuardStarted = authGuardStarted || isNativeAndroidDriverLocation();
}

export async function startDriverBackgroundLocation(): Promise<boolean> {
  return startNativeDriverLocation();
}

export async function stopDriverBackgroundLocation(): Promise<void> {
  await stopNativeDriverLocation();
}
