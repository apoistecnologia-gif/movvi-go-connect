#!/usr/bin/env node
// Cross-platform Capacitor sync (Windows/macOS/Linux).
// Copia capacitor.<role>.config.ts → capacitor.config.ts e renomeia
// android-<role> → android (temporariamente) para rodar `cap sync android`.
//
// Uso: node scripts/cap-sync.mjs <passageiro|motorista>

import { execSync } from "node:child_process";
import { cpSync, existsSync, renameSync, rmSync } from "node:fs";
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

// Se a pasta "android" já existe (ex: extraído de um ZIP por role), reutiliza.
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
  try {
    rmSync(dst);
  } catch {}
}
