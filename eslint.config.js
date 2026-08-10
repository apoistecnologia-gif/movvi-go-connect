import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      ".output",
      ".vinxi",
      "diagnostics-backup/**",
      // Generated/offline identity payload: linting the embedded data URL adds no signal.
      "src/assets/apoisLogoData.ts",
      // Legacy technical homologation harness; the production driver bundle uses
      // src/routes/motorista.app.tsx via src/mobile-route-tree.motorista.ts.
      "src/apois-driver-homologation.tsx",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  eslintPluginPrettier,
  {
    rules: {
      // Keep formatting visible in CI without letting cosmetic differences
      // block functional validation, builds or the production safety guards.
      "prettier/prettier": "warn",
    },
  },
  {
    files: ["src/lib/driverAuth.functions.ts"],
    rules: {
      // This server-only registration module receives the dynamically imported
      // service-role client in two cleanup/lookup helpers. TypeScript still runs
      // as a hard gate; keep the legacy helper annotations visible without
      // blocking the consolidation build until the generated client module is
      // refactored to export its concrete client type.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
