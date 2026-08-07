import type { CapacitorConfig } from "@capacitor/cli";

// APOIS — configuração Capacitor do app real do Motorista.
// O bundle é gerado pela árvore mobile exclusiva do motorista.
const config: CapacitorConfig = {
  appId: "com.apois.motorista",
  appName: "APOIS Motorista",
  webDir: "dist/client",
  android: {
    allowMixedContent: false,
    initialFocus: false,
    captureInput: false,
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
