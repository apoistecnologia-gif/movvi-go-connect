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
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
