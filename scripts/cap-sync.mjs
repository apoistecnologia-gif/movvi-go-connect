#!/usr/bin/env node
// Cross-platform Capacitor sync (Windows/macOS/Linux).
//
// Estratégia:
//   - Mantém `android/` no lugar após a sync (marcado com .movvi-role),
//     para que `build-apk.mjs` funcione sem renomear pastas manualmente.
//   - Se `android/` já existir marcado para OUTRO role, restaura-o antes
//     de começar (android/ → android-<prevRole>) para não misturar builds.
//
// Passos:
//   1. Restaura pasta ativa anterior (se marcada para outro role).
//   2. Copia capacitor.<role>.config.ts → capacitor.config.ts (temporário).
//   3. Renomeia android-<role> → android (se ainda não estiver no lugar).
//   4. Roda `npx cap sync android`.
//   5. Escreve marcador `android/.movvi-role`.
//   6. Restaura capacitor.config.ts anterior (ou apaga se não existia).
//
// Uso: node scripts/cap-sync.mjs <passageiro|motorista>

import { execSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
const marker = resolve(androidLive, ".movvi-role");

if (!existsSync(src)) {
  console.error(`Arquivo não encontrado: ${src}`);
  process.exit(1);
}

// 1. Se android/ existe e é de outro role, restaura para android-<prevRole>.
if (existsSync(androidLive)) {
  let prevRole = null;
  try {
    prevRole = readFileSync(marker, "utf8").trim();
  } catch {
    /* sem marcador — assume que pertence ao role atual */
  }
  if (prevRole && prevRole !== role) {
    const prevRoleDir = resolve(root, `android-${prevRole}`);
    if (existsSync(prevRoleDir)) {
      console.error(
        `[cap-sync] conflito: android/ marcado como '${prevRole}' e android-${prevRole}/ já existe.`,
      );
      process.exit(1);
    }
    console.log(`[cap-sync] restaurando android/ → android-${prevRole}/`);
    renameSync(androidLive, prevRoleDir);
  }
}

// Preserva capacitor.config.ts prévio.
const previousConfig = existsSync(dst) ? readFileSync(dst) : null;

// 2. Copia config específica do role.
cpSync(src, dst);

// 3. Renomeia android-<role> → android se necessário.
if (!existsSync(androidLive)) {
  if (!existsSync(androidRole)) {
    console.error(
      `[cap-sync] nem android/ nem android-${role}/ existem — nada para sincronizar.`,
    );
    if (previousConfig !== null) writeFileSync(dst, previousConfig);
    else try { rmSync(dst); } catch { /* noop */ }
    process.exit(1);
  }
  renameSync(androidRole, androidLive);
}

try {
  // 4. Roda cap sync.
  execSync("npx cap sync android", { stdio: "inherit" });
  // 5. Marca a pasta para o role atual.
  writeFileSync(marker, role, "utf8");
  console.log(
    `[cap-sync] android/ pronto para '${role}'. Rode 'node scripts/build-apk.mjs' ou abra no Android Studio.`,
  );
} finally {
  // 6. Restaura capacitor.config.ts anterior.
  if (previousConfig !== null) {
    try { writeFileSync(dst, previousConfig); } catch { /* noop */ }
  } else {
    try { rmSync(dst); } catch { /* noop */ }
  }
}
