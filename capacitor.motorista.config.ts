import type { CapacitorConfig } from "@capacitor/cli";

// MOVVI — Configuração Capacitor do app do Motorista (Play Store).
// Package ID: com.movvi.driver
// Build correspondente: VITE_APP_ROLE=motorista
//
// NÃO altera Supabase, banco, corridas, GPS, mapas, pagamentos ou notificações.
// Apenas empacota o bundle web (gerado com VITE_APP_ROLE=motorista) em um
// projeto Android nativo para publicação.
const config: CapacitorConfig = {
  appId: "com.movvi.driver",
  appName: "MOVVI Motorista",
  webDir: "dist/client",
  android: {
    allowMixedContent: false,
    // Evita foco inicial programático do WebView antes do usuário tocar no campo.
    initialFocus: false,
    // Mantém a conexão IME padrão do WebView.
    captureInput: false,
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
