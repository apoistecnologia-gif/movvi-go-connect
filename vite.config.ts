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
  // Mobile builds prerender a static SPA shell via TanStack Start's SPA mode.
  // Prerender needs a Node-runnable server bundle, so mobile builds force
  // nitro's `node-server` preset. Web/SSR keeps the Cloudflare preset (Lovable
  // Cloud deploy).
  //
  // `externals.trace: false` desliga o rastreamento/cópia de node_modules do
  // Nitro para `.output/server`. No Windows (especialmente em pastas como
  // Downloads/OneDrive/antivírus ativo) esse passo falha com
  // `EBUSY: resource busy or locked, copyfile ...tslib...package.json`.
  // Para Capacitor só precisamos de `dist/client` (o SPA prerender);
  // o bundle do servidor é descartado depois.
  ...(IS_MOBILE_BUILD
    ? { nitro: { preset: "node-server", externals: { trace: false } } as any }
    : {}),
  tanstackStart: {
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
          // Web/SSR: route through our custom error wrapper (src/server.ts).
          server: { entry: "server" },
        }),
  },
});


