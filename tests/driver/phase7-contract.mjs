import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(path, "utf8");
const includes = (source, needle, label) => assert.ok(source.includes(needle), `${label}: missing ${needle}`);
const excludes = (source, needle, label) => assert.ok(!source.includes(needle), `${label}: forbidden ${needle}`);

const documentsService = read("src/lib/driverDocuments.mobile.ts");
const documentsRoute = read("src/routes/motorista.documentos.tsx");
const financeService = read("src/lib/driverFinance.mobile.ts");
const financeRoute = read("src/routes/motorista.ganhos.tsx");
const lifecycle = read("src/lib/driverRideLifecycle.mobile.ts");
const nativeBridge = read("src/lib/nativeBridge.ts");
const locationPlugin = read("android-motorista/app/src/main/java/com/apois/motorista/DriverLocationPlugin.java");
const locationService = read("android-motorista/app/src/main/java/com/apois/motorista/DriverLocationService.java");
const homologationWorkflow = read(".github/workflows/apois-driver-homologation.yml");
const driverApp = read("src/routes/motorista.app.tsx");
const dispatch = read("supabase/functions/dispatch-ride/index.ts");
const pushSender = read("supabase/functions/send-ride-push/index.ts");

includes(documentsService, 'rpc("driver_update_document"', "KYC RPC");
includes(documentsService, '"vehicle_photo"', "KYC vehicle photo");
includes(documentsRoute, "uploadDriverDocument", "KYC route client");
excludes(documentsRoute, "useServerFn", "KYC static mobile route");
excludes(documentsRoute, '.eq("user_id", session.user.id)', "KYC auth/profile identity mix");

includes(financeService, 'rpc("get_driver_financial_dashboard"', "canonical Driver finance dashboard");
includes(financeService, 'rpc("driver_request_withdrawal"', "canonical Driver payout request");
includes(financeRoute, "dashboard.period.settledEarningsCents", "settlement-backed UI");
excludes(financeRoute, '.from("rides")', "Driver finance ride arithmetic");
excludes(financeRoute.toLowerCase(), "em breve", "fake withdrawal UI");

for (const rpc of [
  "driver_accept_ride",
  "driver_reject_ride",
  "driver_mark_arrived",
  "driver_start_ride",
  "driver_finish_ride",
  "driver_cancel_ride",
  "driver_rate_passenger",
]) includes(lifecycle, rpc, `Driver lifecycle ${rpc}`);

includes(nativeBridge, "driver_register_push_token", "native push token registration");
includes(nativeBridge, "PushNotifications.register", "native push registration");
includes(homologationWorkflow, "VITE_ENABLE_NATIVE_PUSH=true", "homologation native push flag");
includes(locationPlugin, "startForegroundService", "background foreground-service start");
includes(locationService, "startForeground", "Android foreground location notification");
includes(locationService, "driver_set_presence", "native background presence RPC");

includes(driverApp, "startRideRingtone", "incoming ride ringtone");
includes(driverApp, "speak", "Driver voice guidance");
includes(driverApp, "DriverVoiceToggle", "Driver voice toggle");
includes(dispatch, "/functions/v1/send-ride-push", "dispatch FCM handoff");
includes(dispatch, 'title: "APOIS • Nova corrida disponível"', "APOIS push copy");
includes(pushSender, "FIREBASE_SERVICE_ACCOUNT_B64", "FCM service-account secret contract");
includes(pushSender, "messaging.googleapis.com/v1/projects", "FCM HTTP v1 delivery");
includes(pushSender, 'channel_id: "apois_rides"', "Android ride notification channel");
includes(pushSender, 'event === "driver.new_ride_request"', "ride-request preference routing");
includes(pushSender, "user_notification_tokens", "canonical notification tokens");

console.log("APOIS_DRIVER_PHASE7_CONTRACT_OK");
