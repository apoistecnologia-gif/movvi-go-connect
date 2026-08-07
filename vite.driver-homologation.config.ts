import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const key of ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"]) {
    if (!String(env[key] ?? "").trim()) throw new Error(`${key} ausente no build do APOIS Motorista`);
  }

  return {
    appType: "spa",
    plugins: [react()],
    build: {
      outDir: "dist/client",
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(__dirname, "index.driver-homologation.html"),
      },
    },
  };
});
