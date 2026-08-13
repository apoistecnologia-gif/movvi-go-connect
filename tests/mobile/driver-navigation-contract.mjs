import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(path, "utf8");
const includes = (source, needle, label) => assert.ok(source.includes(needle), `${label}: missing ${needle}`);

const map = read("src/lib/googleMaps.ts");
const routes = read("src/lib/driverRoutes.mobile.ts");
const voice = read("src/lib/voiceNav.ts");
const manifest = read("android-motorista/app/src/main/AndroidManifest.xml");
const mainActivity = read("android-motorista/app/src/main/java/com/apois/motorista/MainActivity.java");
const nativeVoice = read("android-motorista/app/src/main/java/com/apois/motorista/DriverVoicePlugin.java");

includes(map, 'featureType: "administrative.locality"', "City labels must remain visible");
includes(map, 'featureType: "administrative.neighborhood"', "Neighborhood labels must remain visible");
includes(map, 'featureType: "road.local"', "Local street labels must remain visible");
includes(map, 'featureType: "poi"', "Place labels must remain available");
includes(map, 'visibility: "on"', "Navigation map must explicitly show labels");

includes(routes, "steps?: DriverRouteStep[]", "Route response must accept turn-by-turn steps");
includes(routes, "Array.isArray(result.steps)", "Driver must consume route steps from backend");
includes(routes, "instruction: step.instruction.trim()", "Driver route instructions must be preserved");

includes(voice, 'registerPlugin<DriverVoicePlugin>("DriverVoice")', "Capacitor native voice bridge");
includes(voice, "NativeDriverVoice.speak", "Native voice playback");
includes(voice, "Capacitor.isNativePlatform()", "Native APK voice selection");
includes(voice, "tickNavigation", "Turn-by-turn proximity announcer");

includes(mainActivity, "registerPlugin(DriverVoicePlugin.class)", "DriverVoice native plugin registration");
includes(nativeVoice, 'GOOGLE_TTS_ENGINE = "com.google.android.tts"', "Google Speech Services preference");
includes(nativeVoice, 'new Locale("pt", "BR")', "Brazilian Portuguese TTS locale");
includes(nativeVoice, "USAGE_ASSISTANCE_NAVIGATION_GUIDANCE", "Navigation audio usage");
includes(nativeVoice, "TextToSpeech.QUEUE_FLUSH", "Interruptible navigation guidance");
includes(manifest, 'android:name="com.google.android.tts"', "Google TTS package visibility");
includes(manifest, 'android:name="android.intent.action.TTS_SERVICE"', "Android TTS service visibility");

console.log("APOIS_DRIVER_NAVIGATION_CONTRACT_OK");
