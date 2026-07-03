import type { ReactNode } from "react";
import { isDevelopmentEnvironment } from "@/lib/environment";
import { AdminGuard } from "@/components/AdminGuard";

/**
 * Gate for dev/debug routes.
 *
 * - In DEV / preview / editor iframe → renders children directly.
 * - In PRODUCTION → requires an authenticated admin session (AdminGuard);
 *   non-admins see an access-restricted screen and can never reach the route.
 *
 * This lets us keep useful diagnostic pages available during development
 * without exposing them on the published site.
 */
export function DevOrAdminGuard({ children }: { children: ReactNode }) {
  if (isDevelopmentEnvironment()) return <>{children}</>;
  return <AdminGuard>{children}</AdminGuard>;
}
