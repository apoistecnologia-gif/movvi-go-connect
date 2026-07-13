#!/usr/bin/env node
// Cross-platform: roda o gradlew do projeto android para gerar o APK debug.
// Uso: node scripts/build-apk.mjs
//
// Assume que `npm run build:<role>` e `npm run sync:<role>` já rodaram e
// que existe uma pasta `android/` na raiz (o cap-sync.mjs recria android/
// a partir de android-<role> durante a sync).
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const androidDir = resolve(root, "android");
if (!existsSync(androidDir)) {
  console.error(
    "[build-apk] pasta 'android/' não existe. Rode `npm run android:<role>` primeiro.",
  );
  process.exit(1);
}

const isWindows = process.platform === "win32";
const gradlew = isWindows ? "gradlew.bat" : "./gradlew";

try {
  execSync(`${gradlew} assembleDebug`, { cwd: androidDir, stdio: "inherit" });
} catch (err) {
  console.error("[build-apk] gradle assembleDebug falhou.");
  process.exit(1);
}

const apkPath = resolve(
  androidDir,
  "app/build/outputs/apk/debug/app-debug.apk",
);
if (existsSync(apkPath)) {
  console.log(`\n[build-apk] APK gerado em: ${apkPath}`);
} else {
  console.warn(
    "\n[build-apk] gradle terminou, mas app-debug.apk não foi encontrado.",
  );
}
