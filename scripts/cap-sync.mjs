#!/usr/bin/env node
// Cross-platform Capacitor sync (Windows/macOS/Linux).
//
// Estratégia:
//   - `android-<role>/` é a fonte da verdade do projeto nativo.
//   - A cada execução, recria `android/` a partir de `android-<role>/`.
//   - Isso impede que um APK seja compilado com MainActivity/Manifest/assets
//     antigos que sobraram de uma tentativa anterior.
//   - Preserva `android/local.properties` durante o sync.
//
// Passos:
//   1. Preserva local.properties da pasta ativa anterior, se existir.
//   2. Copia capacitor.<role>.config.ts → capacitor.config.ts (temporário).
//   3. Recria android/ a partir de android-<role>/.
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
const localProperties = resolve(androidLive, "local.properties");

if (!existsSync(src)) {
  console.error(`Arquivo não encontrado: ${src}`);
  process.exit(1);
}

if (!existsSync(androidRole)) {
  console.error(`[cap-sync] android-${role}/ não existe — nada para sincronizar.`);
  process.exit(1);
}

// 1. Preserva apenas a configuração local do SDK Android.
const preservedLocalProperties = existsSync(localProperties)
  ? readFileSync(localProperties)
  : null;

// Preserva capacitor.config.ts prévio.
const previousConfig = existsSync(dst) ? readFileSync(dst) : null;

// 2. Copia config específica do role.
cpSync(src, dst);

// 3. Recria android/ a partir da fonte do role para nunca usar código nativo antigo.
rmSync(androidLive, { recursive: true, force: true });
cpSync(androidRole, androidLive, { recursive: true });
if (preservedLocalProperties !== null) {
  writeFileSync(localProperties, preservedLocalProperties);
}

try {
  // 4. Roda cap sync.
  execSync("npx cap sync android", { stdio: "inherit" });
  if (preservedLocalProperties !== null) {
    writeFileSync(localProperties, preservedLocalProperties);
  }
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
