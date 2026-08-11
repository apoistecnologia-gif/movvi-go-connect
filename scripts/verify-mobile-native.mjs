#!/usr/bin/env node
// Validação anti-regressão do APK Android.
// Impede compilar novamente um pacote com MainActivity antiga, target SDK incorreto
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
const packageDir = role === "passageiro" ? "com/movvi/passenger" : "com/apois/motorista";
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
const appGradle = readRequired(resolve(androidDir, "app/build.gradle"));
const config = readRequired(configFile);

const expectedTargetSdk = role === "motorista" ? 36 : 34;
const targetSdkPattern = new RegExp(`targetSdkVersion\\s*=\\s*${expectedTargetSdk}\\b`);
if (!targetSdkPattern.test(variables)) {
  fail(`targetSdkVersion do ${role} precisa ser ${expectedTargetSdk}.`);
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
    fail(`MainActivity.java contém '${pattern}'. A Activity não pode interferir no IME/WebView.`);
  }
}

if (role === "motorista") {
  const service = readRequired(
    resolve(androidDir, "app/src/main/java/com/apois/motorista/DriverLocationService.java"),
  );
  const plugin = readRequired(
    resolve(androidDir, "app/src/main/java/com/apois/motorista/DriverLocationPlugin.java"),
  );

  const requiredManifestFragments = [
    "android.permission.ACCESS_BACKGROUND_LOCATION",
    "android.permission.FOREGROUND_SERVICE_LOCATION",
    'android:name=".DriverLocationService"',
    'android:foregroundServiceType="location"',
  ];
  for (const fragment of requiredManifestFragments) {
    if (!manifest.includes(fragment))
      fail(`contrato de localização nativa ausente no Manifest: ${fragment}`);
  }

  if (!appGradle.includes("com.google.android.gms:play-services-location")) {
    fail("play-services-location precisa estar no APK do motorista.");
  }
  if (!mainActivity.includes("registerPlugin(DriverLocationPlugin.class)")) {
    fail("DriverLocationPlugin precisa estar registrado na MainActivity.");
  }

  for (const fragment of [
    "FusedLocationProviderClient",
    "startForeground",
    "driver_set_presence",
    "/auth/v1/token?grant_type=refresh_token",
  ]) {
    if (!service.includes(fragment)) fail(`DriverLocationService incompleto: ${fragment}`);
  }
  if (!plugin.includes("ContextCompat.startForegroundService")) {
    fail("DriverLocationPlugin precisa iniciar Foreground Service explicitamente.");
  }

  const nativeBridge = readRequired(resolve(root, "src/lib/nativeBridge.ts"));
  const packageJson = readRequired(resolve(root, "package.json"));
  if (!nativeBridge.includes("@capacitor/push-notifications")) {
    fail("bridge nativa do motorista precisa integrar @capacitor/push-notifications.");
  }
  if (!packageJson.includes('"@capacitor/push-notifications"')) {
    fail("dependência @capacitor/push-notifications ausente.");
  }
}

if (checkLiveAndroid) {
  const packedConfigPath = resolve(androidDir, "app/src/main/assets/capacitor.config.json");
  const packedConfigRaw = readRequired(packedConfigPath);
  let packedConfig;
  try {
    packedConfig = JSON.parse(packedConfigRaw);
  } catch {
    fail("android/app/src/main/assets/capacitor.config.json não contém JSON válido.");
  }

  if (packedConfig.appId !== (role === "motorista" ? "com.apois.motorista" : packedConfig.appId)) {
    fail(`appId empacotado do motorista está incorreto: ${packedConfig.appId ?? "ausente"}.`);
  }
  if (packedConfig.android?.initialFocus !== false) {
    fail(
      `config empacotada precisa ter android.initialFocus=false; recebido: ${packedConfig.android?.initialFocus}.`,
    );
  }
  if (packedConfig.android?.captureInput !== false) {
    fail(
      `config empacotada precisa ter android.captureInput=false; recebido: ${packedConfig.android?.captureInput}.`,
    );
  }
}

console.log(
  `[verify-mobile-native] OK (${role}${checkLiveAndroid ? ", android/ + config empacotada" : ", fonte"}): native login/input safe${role === "motorista" ? ", foreground location contract present" : ""}.`,
);
