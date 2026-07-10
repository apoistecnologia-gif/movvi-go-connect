// @lovable.dev/vite-tanstack-config already includes tanstackStart, viteReact, tailwindcss,
// tsConfigPaths, nitro, componentTagger (dev-only), etc. — do NOT add them manually.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Web/SSR: route through our custom error wrapper (src/server.ts).
    // Mobile/Capacitor does NOT use this config; it uses vite.mobile.config.ts
    // to build a client-only SPA and avoid Nitro/.output/server entirely.
    server: { entry: "server" },
  },
});


