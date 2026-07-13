#!/usr/bin/env node
// Validação anti-regressão do APK Android.
// Impede compilar novamente um pacote com MainActivity antigo, target SDK 35/36
// ou configuração Capacitor que quebra entrada de texto no WebView.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const role = process.argv[2];
const checkLiveAndroid = process.argv.includes("--live");

if (role !== "passageiro" && role !== "motorista") {
  console.error("Uso: node scripts/verify-mobile-native.mjs <passageiro|motorista> [--live]");
  process.exit(1);
}

const root = process.cwd();
const androidDir = resolve(root, checkLiveAndroid ? "android" : `android-${role}`);
const packageDir = role === "passageiro" ? "com/movvi/passenger" : "com/movvi/driver";
const configFile = resolve(root, `capacitor.${role}.config.ts`);

function readRequired(path) {
  if (!existsSync(path)) {
    console.error(`[verify-mobile-native] arquivo obrigatório não encontrado: ${path}`);
    process.exit(1);
  }
  return readFileSync(path, "utf8");
}

function fail(message) {
  console.error(`[verify-mobile-native] ${message}`);
  process.exit(1);
}

const variables = readRequired(resolve(androidDir, "variables.gradle"));
const manifest = readRequired(resolve(androidDir, "app/src/main/AndroidManifest.xml"));
const mainActivity = readRequired(
  resolve(androidDir, `app/src/main/java/${packageDir}/MainActivity.java`),
);
const config = readRequired(configFile);

if (!/targetSdkVersion\s*=\s*34\b/.test(variables)) {
  fail("targetSdkVersion precisa permanecer 34 enquanto validamos a digitação no APK.");
}

if (!/android:windowSoftInputMode="adjustResize"/.test(manifest)) {
  fail('AndroidManifest.xml precisa usar android:windowSoftInputMode="adjustResize".');
}

if (!/android:hardwareAccelerated="true"/.test(manifest)) {
  fail('AndroidManifest.xml precisa declarar android:hardwareAccelerated="true" no <application>.');
}

if (!/initialFocus:\s*false/.test(config)) {
  fail(`capacitor.${role}.config.ts precisa declarar android.initialFocus=false.`);
}

if (!/captureInput:\s*false/.test(config)) {
  fail(`capacitor.${role}.config.ts precisa declarar android.captureInput=false.`);
}

const forbiddenMainActivityPatterns = [
  "requestFocus()",
  "requestFocusFromTouch",
  "setImportantForAutofill",
  "SOFT_INPUT_ADJUST_PAN",
  "SOFT_INPUT_ADJUST_RESIZE",
  "setSoftInputMode",
  "postDelayed",
  "OnTouchListener",
];

for (const pattern of forbiddenMainActivityPatterns) {
  if (mainActivity.includes(pattern)) {
    fail(
      `MainActivity.java contém '${pattern}'. A Activity deve ficar mínima para não interferir no IME/WebView.`,
    );
  }
}

console.log(
  `[verify-mobile-native] OK (${role}${checkLiveAndroid ? ", android/" : ", fonte"}): native login/input safe.`,
);