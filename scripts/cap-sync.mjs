#!/usr/bin/env node
// Cross-platform Capacitor sync (Windows/macOS/Linux).
//
// Faz:
//   1. Copia capacitor.<role>.config.ts → capacitor.config.ts (temporário)
//   2. Renomeia android-<role> → android (temporário, se existir)
//   3. Roda `npx cap sync android`
//   4. Restaura capacitor.config.ts anterior (ou apaga se não existia)
//   5. Restaura android → android-<role>
//
// Uso: node scripts/cap-sync.mjs <passageiro|motorista>

import { execSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const role = process.argv[2];
if (role !== "passageiro" && role !== "motorista") {
  console.error("Uso: node scripts/cap-sync.mjs <passageiro|motorista>");
  process.exit(1);
}

const root = process.cwd();
const src = resolve(root, `capacitor.${role}.config.ts`);
const dst = resolve(root, "capacitor.config.ts");
const androidRole = resolve(root, `android-${role}`);
const androidLive = resolve(root, "android");

if (!existsSync(src)) {
  console.error(`Arquivo não encontrado: ${src}`);
  process.exit(1);
}

// Preserva o capacitor.config.ts pré-existente para restaurar depois.
const previousConfig = existsSync(dst) ? readFileSync(dst) : null;

const roleHadFolder = existsSync(androidRole);
const androidExists = existsSync(androidLive);

cpSync(src, dst);

let renamed = false;
if (!androidExists && roleHadFolder) {
  renameSync(androidRole, androidLive);
  renamed = true;
}

try {
  execSync("npx cap sync android", { stdio: "inherit" });
} finally {
  if (renamed) {
    renameSync(androidLive, androidRole);
  }
  // Restaura config anterior ou remove o arquivo temporário se não existia.
  if (previousConfig !== null) {
    try {
      writeFileSync(dst, previousConfig);
    } catch {
      /* noop */
    }
  } else {
    try {
      rmSync(dst);
    } catch {
      /* noop */
    }
  }
}
