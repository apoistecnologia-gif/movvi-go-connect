import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { startCompilerPlugin } from "./node_modules/@tanstack/start-plugin-core/dist/esm/vite/start-compiler-plugin/plugin.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const required = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"];
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length) {
    throw new Error(`Admin build sem variáveis obrigatórias: ${missing.join(", ")}`);
  }

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
    build: {
      outDir: "dist/admin",
      emptyOutDir: true,
      manifest: false,
      ssrManifest: false,
      rollupOptions: { input: "index.admin.html" },
    },
  };
});
