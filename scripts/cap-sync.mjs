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
//   4. Roda validações nativas antes do sync.
//   5. Roda `npx cap sync android`.
//   6. Roda validações nativas depois do sync.
//   7. Escreve marcador `android/.movvi-role`.
//   8. Restaura capacitor.config.ts anterior (ou apaga se não existia).
//
// Uso: node scripts/cap-sync.mjs <passageiro|motorista>

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
const verifyScript = resolve(root, "scripts/verify-mobile-native.mjs");
const capCli = resolve(root, "node_modules/@capacitor/cli/bin/capacitor");

if (!existsSync(src)) {
  console.error(`Arquivo não encontrado: ${src}`);
  process.exit(1);
}

if (!existsSync(androidRole)) {
  console.error(`[cap-sync] android-${role}/ não existe — nada para sincronizar.`);
  process.exit(1);
}

// 1. Preserva apenas a configuração local do SDK Android.
const preservedLocalProperties = existsSync(localProperties) ? readFileSync(localProperties) : null;

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
  // 4. Valida a fonte nativa antes de criar android/.
  execFileSync(process.execPath, [verifyScript, role], {
    stdio: "inherit",
  });

  // 5. Roda cap sync.
  execFileSync(process.execPath, [capCli, "sync", "android"], {
    stdio: "inherit",
  });
  if (preservedLocalProperties !== null) {
    writeFileSync(localProperties, preservedLocalProperties);
  }

  // 6. Confirma que android/ também ficou com a versão nativa correta.
  execFileSync(process.execPath, [verifyScript, role, "--live"], {
    stdio: "inherit",
  });

  // 7. Marca a pasta para o role atual.
  writeFileSync(marker, role, "utf8");
  console.log(
    `[cap-sync] android/ pronto para '${role}'. Rode 'node scripts/build-apk.mjs' ou abra no Android Studio.`,
  );
} finally {
  // 8. Restaura capacitor.config.ts anterior.
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
