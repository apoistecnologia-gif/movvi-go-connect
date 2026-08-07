import type { CapacitorConfig } from "@capacitor/cli";

// APOIS — configuração Capacitor do app real do Motorista.
// O bundle é gerado pela árvore mobile exclusiva do motorista.
const config: CapacitorConfig = {
  appId: "com.apois.motorista",
  appName: "APOIS Motorista",
  webDir: "dist/client",
  android: {
    allowMixedContent: false,
    // O WebView precisa receber foco para que inputs HTML possam abrir o teclado
    // e aceitar digitação normalmente no Android. O default do Capacitor é true.
    initialFocus: true,
    // Mantemos a conexão de entrada padrão do Android. captureInput=true troca
    // para uma implementação simplificada com limitações de teclado.
    captureInput: false,
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
