import type { CapacitorConfig } from "@capacitor/cli";

// MOVVI — Configuração Capacitor do app do Passageiro (Play Store).
// Package ID: com.movvi.passenger
// Build correspondente: VITE_APP_ROLE=passageiro
//
// NÃO altera Supabase, banco, corridas, GPS, mapas, pagamentos ou notificações.
// Apenas empacota o bundle web (gerado com VITE_APP_ROLE=passageiro) em um
// projeto Android nativo para publicação.
const config: CapacitorConfig = {
  appId: "com.movvi.passenger",
  appName: "MOVVI",
  webDir: "dist/client",
  android: {
    allowMixedContent: false,
    // IMPORTANTE: manter false.
    // captureInput=true troca a conexão padrão do WebView por BaseInputConnection
    // e causa exatamente o bug visto no APK: o teclado mostra sugestões/letras,
    // mas os caracteres não entram no <input> focado em alguns Android/WebView.
    captureInput: false,
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
