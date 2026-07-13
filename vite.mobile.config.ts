import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { resolve } from "node:path";
import { startCompilerPlugin } from "./node_modules/@tanstack/start-plugin-core/dist/esm/vite/start-compiler-plugin/plugin.js";

const REMOTE_SERVER_FN_BASE = "https://movvi-go-connect.lovable.app/_serverFn/";

// VITE_APP_ROLE define QUAL bundle está sendo gerado.
// - "passageiro" → só carrega src/mobile-route-tree.passageiro.ts (ZERO rotas /motorista/*)
// - "motorista"  → só carrega src/mobile-route-tree.motorista.ts (ZERO rotas /passageiro/*)
const rawRole = (process.env.VITE_APP_ROLE || "").toLowerCase().trim();
const role = rawRole === "motorista" || rawRole === "driver" ? "motorista" : "passageiro";
const activeRouteTree = resolve(
  __dirname,
  role === "motorista"
    ? "src/mobile-route-tree.motorista.ts"
    : "src/mobile-route-tree.passageiro.ts",
);

// Validação obrigatória: sem essas chaves o APK não consegue falar com o
// backend e a tela fica em branco no primeiro launch. Não imprimimos valores.
const REQUIRED_ENV = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(
    `[mobile-spa] Variáveis obrigatórias ausentes: ${missing.join(", ")}. ` +
      "Defina-as em .env.mobile ou no ambiente antes do build.",
  );
  process.exit(1);
}

export default defineConfig({
  appType: "spa",
  plugins: [
    ...startCompilerPlugin({
      framework: "react",
      environments: [{ name: "client", type: "client" }],
      providerEnvName: "ssr",
    } as any),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  resolve: {
    alias: {
      // Alias virtual: mobile.tsx sempre importa daqui, o Vite resolve para
      // a árvore correta do papel corrente. Rotas do outro papel NUNCA
      // entram no bundle final.
      "virtual:mobile-route-tree": activeRouteTree,
    },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    manifest: false,
    ssrManifest: false,
    rollupOptions: {
      input: "index.mobile.html",
    },
  },
  define: {
    "process.env.TSS_SERVER_FN_BASE": JSON.stringify(REMOTE_SERVER_FN_BASE),
    "import.meta.env.TSS_SERVER_FN_BASE": JSON.stringify(REMOTE_SERVER_FN_BASE),
  },
});
