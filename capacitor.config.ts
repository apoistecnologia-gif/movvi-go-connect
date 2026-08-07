import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.apois.motorista",
  appName: "APOIS Motorista",
  webDir: "dist/client",
  android: {
    allowMixedContent: false,
    initialFocus: false,
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
