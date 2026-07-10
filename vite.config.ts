// @lovable.dev/vite-tanstack-config already includes tanstackStart, viteReact, tailwindcss,
// tsConfigPaths, nitro, componentTagger (dev-only), etc. — do NOT add them manually.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Mobile builds (Capacitor) run VITE_APP_ROLE=passageiro|motorista and need a
// fully client-rendered SPA — no Cloudflare Worker at runtime. TanStack Start's
// native SPA mode generates a prerendered static HTML shell at maskPath that
// boots the router on the client, with no SSR dependency.
const IS_MOBILE_BUILD =
  process.env.VITE_APP_ROLE === "passageiro" || process.env.VITE_APP_ROLE === "motorista";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    server: { entry: "server" },
    // For Capacitor Android: prerender a static SPA shell. Any deep-link inside
    // the WebView boots this shell and the client router takes over.
    ...(IS_MOBILE_BUILD
      ? {
          spa: {
            enabled: true,
            maskPath: "/",
            prerender: {
              enabled: true,
              outputPath: "/index.html",
              crawlLinks: false,
            },
          },
          pages: [],
        }
      : {}),
  },
});
