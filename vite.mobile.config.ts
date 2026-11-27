import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { resolve } from "node:path";
import { startCompilerPlugin } from "./node_modules/@tanstack/start-plugin-core/dist/esm/vite/start-compiler-plugin/plugin.js";


function requireOpenShiftMobileEnvironment() {
  const rawOrigin = process.env.APOIS_HML_GATEWAY_ORIGIN?.trim() ?? "";
  const key = process.env.APOIS_HML_PUBLIC_KEY?.trim() ?? "";
  const origin = new URL(rawOrigin);
  if (origin.origin !== rawOrigin || !/^https:\/\/apois-[a-z0-9-]+-apoistecnologia-dev\.apps\.rm3\.7wse\.p1\.openshiftapps\.com$/.test(origin.origin)) {
    throw new Error("O build HML exige a origem HTTPS do Gateway no namespace apoistecnologia-dev.");
  }

  let validPublicKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  const parts = key.split(".");
  if (parts.length === 3 && /^[A-Za-z0-9_-]+$/.test(parts[1])) {
    try {
      const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      validPublicKey = claims.role === "anon" && claims.ref !== "vqtucstyduxrqjgyigfk";
    } catch {
      validPublicKey = false;
    }
  }
  if (!validPublicKey) {
    throw new Error("O build HML exige uma chave pública de homologação.");
  }
  process.env.VITE_SUPABASE_URL = origin.origin;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = key;
  // No device registration or real push during the restricted HML pilot.
  process.env["VITE_ENABLE_NATIVE_PUSH"] = "false";
  return origin.origin;
}


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
  const hmlOrigin = requireOpenShiftMobileEnvironment();
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
      "process.env.TSS_SERVER_FN_BASE": JSON.stringify(hmlOrigin + "/_serverFn/"),
      "import.meta.env.TSS_SERVER_FN_BASE": JSON.stringify(hmlOrigin + "/_serverFn/"),
    },
  };
});
