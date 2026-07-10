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
    // Web/SSR build keeps the custom error-wrapper entry (src/server.ts).
    // Mobile builds prerender a static SPA shell instead, so they must NOT
    // override the server entry — the prerender preview-server expects the
    // default `dist/server/server.js` output name.
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
        }
      : {
          server: { entry: "server" },
        }),
  },
});

