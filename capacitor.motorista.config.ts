import type { CapacitorConfig } from "@capacitor/cli";

// APOIS — configuração Capacitor do app real do Motorista.
// O bundle é gerado pela árvore mobile exclusiva do motorista.
const config: CapacitorConfig = {
  appId: "com.apois.motorista",
  appName: "APOIS Motorista",
  webDir: "dist/client",
  android: {
    allowMixedContent: false,
    // Contrato nativo estável já validado na base MOVVI: não forçar foco
    // programático no WebView; o toque do usuário deve focar o elemento HTML.
    initialFocus: false,
    // Mantém a conexão de entrada padrão do Android/WebView.
    captureInput: false,
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
