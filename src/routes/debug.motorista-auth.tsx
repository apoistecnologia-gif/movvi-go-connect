import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

/**
 * Retired diagnostic route.
 *
 * The former page imported a legacy server-registration module that contained
 * a service-role signup path predating the current v3 KYC contract. Keeping
 * this route inert ensures that code is not pulled into the production server
 * bundle while preserving the URL as a harmless redirect for old bookmarks.
 */
export const Route = createFileRoute("/debug/motorista-auth")({
  head: () => ({
    meta: [
      { title: "APOIS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: RetiredDriverAuthDebugRoute,
});

function RetiredDriverAuthDebugRoute() {
  const navigate = useNavigate();

  useEffect(() => {
    void navigate({ to: "/", replace: true });
  }, [navigate]);

  return null;
}
