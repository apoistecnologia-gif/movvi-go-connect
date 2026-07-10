import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { startCompilerPlugin } from "./node_modules/@tanstack/start-plugin-core/dist/esm/vite/start-compiler-plugin/plugin.js";

const REMOTE_SERVER_FN_BASE = "https://movvi-go-connect.lovable.app/_serverFn/";

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
