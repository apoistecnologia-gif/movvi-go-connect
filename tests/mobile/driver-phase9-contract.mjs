import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(path, "utf8");
const includes = (source, needle, label) => assert.ok(source.includes(needle), `${label}: missing ${needle}`);
const excludes = (source, needle, label) => assert.ok(!source.includes(needle), `${label}: forbidden ${needle}`);

const pkg = JSON.parse(read("package.json"));
const capacitor = read("capacitor.motorista.config.ts");
const manifest = read("android-motorista/app/src/main/AndroidManifest.xml");
const strings = read("android-motorista/app/src/main/res/values/strings.xml");
const gradle = read("android-motorista/app/build.gradle");
const nativeBridge = read("src/lib/nativeBridge.ts");
const recovery = read("src/lib/auth/driverPasswordRecovery.ts");
const recoveryRoute = read("src/routes/motorista.recuperar-senha.tsx");
const resetRoute = read("src/routes/motorista.redefinir-senha.tsx");
const loginRoute = read("src/routes/motorista.login.tsx");
const rootRoute = read("src/routes/__root.tsx");

assert.equal(pkg.dependencies?.["@capacitor/app"], "^8.1.1", "Capacitor App plugin must match v8 release line");
includes(capacitor, 'appId: "com.apois.motorista"', "Driver package id");
includes(capacitor, 'appName: "APOIS Motorista"', "Driver app name");
includes(manifest, 'android:allowBackup="false"', "Android backup hardening");
includes(manifest, 'android:usesCleartextTraffic="false"', "Android cleartext hardening");
includes(manifest, 'android.permission.ACCESS_BACKGROUND_LOCATION', "Background location permission");
includes(manifest, 'android.permission.POST_NOTIFICATIONS', "Notification permission");
includes(manifest, 'com.google.firebase.messaging.default_notification_channel_id', "Firebase default channel metadata");
includes(manifest, 'android:scheme="@string/password_recovery_scheme"', "Driver recovery intent filter");
includes(manifest, 'android:pathPrefix="/redefinir-senha"', "Driver recovery path");
includes(strings, '<string name="password_recovery_scheme">apoismotorista</string>', "Driver recovery scheme");
includes(strings, '<string name="default_notification_channel_id">apois_rides</string>', "Driver ride channel string");

includes(nativeBridge, "PushNotifications.createChannel", "Native notification channel creation");
includes(nativeBridge, 'id: DRIVER_RIDE_CHANNEL_ID', "Canonical ride channel id");
includes(recovery, 'DRIVER_PASSWORD_RECOVERY_REDIRECT = "apoismotorista://auth/redefinir-senha"', "Native recovery redirect");
includes(recovery, 'App.addListener("appUrlOpen"', "Native app URL listener");
includes(recovery, "App.getLaunchUrl", "Cold-start recovery link");
includes(recovery, "exchangeCodeForSession", "PKCE recovery exchange");
includes(recovery, "setSession", "Token recovery fallback");
includes(recoveryRoute, "resetPasswordForEmail", "Recovery email request");
includes(resetRoute, "updateUser({ password })", "Password update");
includes(loginRoute, 'to="/motorista/recuperar-senha"', "Forgot password login CTA");
includes(rootRoute, "DriverPasswordRecoveryBridge", "Global recovery bridge");

includes(gradle, "APOIS_VERSION_CODE", "Release versionCode input");
includes(gradle, "APOIS_VERSION_NAME", "Release versionName input");
includes(gradle, "APOIS_UPLOAD_KEYSTORE_PATH", "External upload keystore path");
includes(gradle, "APOIS_UPLOAD_KEY_ALIAS", "External upload alias");
includes(gradle, "APOIS_UPLOAD_STORE_PASSWORD", "External upload store password");
includes(gradle, "APOIS_UPLOAD_KEY_PASSWORD", "External upload key password");
excludes(gradle.toLowerCase(), ".jks\"", "Hardcoded JKS path");

console.log("APOIS_DRIVER_PHASE9_RELEASE_CONTRACT_OK");
