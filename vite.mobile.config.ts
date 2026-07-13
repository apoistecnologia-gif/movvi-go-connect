import { defineConfig, loadEnv } from "vite";
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

export default defineConfig(({ mode }) => {
  // loadEnv carrega .env, .env.mobile, .env.mobile.local etc. de acordo com --mode.
  // O terceiro argumento "" desativa o filtro de prefixo, para conseguirmos ler
  // também variáveis do processo se estiverem presentes.
  const env = loadEnv(mode, process.cwd(), "");

  // Validação obrigatória: sem essas chaves o APK não consegue falar com o
  // backend e a tela fica em branco no primeiro launch. NÃO imprimimos valores.
  const REQUIRED_ENV = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"];
  const missing = REQUIRED_ENV.filter((k) => !env[k] || env[k].trim() === "");
  if (missing.length > 0) {
    console.error(
      `[mobile-spa] Variáveis obrigatórias ausentes: ${missing.join(", ")}. ` +
        "Defina-as em .env.mobile ou no ambiente antes do build.",
    );
    process.exit(1);
  }
  console.log(
    `[mobile-spa] env OK (mode=${mode}, role=${role}): ${REQUIRED_ENV.join(", ")} presentes.`,
  );

  return {
    appType: "spa",
    plugins: [
      ...startCompilerPlugin({
        framework: "react",
        environments: [{ name: "client", type: "client" }],
        providerEnvName: "ssr",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  };
});
