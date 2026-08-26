import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Legacy server signup endpoint intentionally retired.
 *
 * Driver onboarding is canonicalized in `driverRegistration.mobile.ts` and the
 * `driver_complete_registration_v3` RPC. The previous implementation in this
 * module created confirmed Auth users with the service role and persisted the
 * Auth UID directly into `drivers.user_id`, bypassing the current profile/KYC
 * contract. Keep the export as a hard-fail compatibility stub so any stale
 * caller cannot silently reactivate the old path.
 */
export const cadastrarMotorista = createServerFn({ method: "POST" })
  .inputValidator((input) => z.unknown().parse(input))
  .handler(async () => {
    throw new Error("legacy_driver_registration_disabled");
  });

const DriverDiagnosticSchema = z.object({
  email: z.string().trim().email(),
});

type DriverDiagnosticResult = {
  auth_exists: boolean;
  driver_exists: boolean;
  auth_user_id: string | null;
  status: string | null;
  table: string;
  auth_link_field: string;
  related_profile_exists: boolean;
  related_profile_table: string;
  error: string | null;
};

function disabledDiagnostic(): DriverDiagnosticResult {
  return {
    auth_exists: false,
    driver_exists: false,
    auth_user_id: null,
    status: null,
    table: "drivers",
    auth_link_field: "user_id",
    related_profile_exists: false,
    related_profile_table: "users",
    error: "Diagnóstico legado desativado. Use as ferramentas administrativas oficiais da APOIS.",
  };
}

/** Compatibility stub for old development imports; it exposes no account data. */
export const diagnosticarAuthMotorista = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DriverDiagnosticSchema.parse(input))
  .handler(async () => disabledDiagnostic());
