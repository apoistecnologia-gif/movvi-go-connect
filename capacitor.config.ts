import type { CapacitorConfig } from "@capacitor/cli";

// Config padrão exigida pelo Capacitor CLI. Não é usada diretamente para
// gerar os apps de produção — cada app usa seu próprio arquivo:
//   - capacitor.passageiro.config.ts  → com.movvi.passenger
//   - capacitor.motorista.config.ts   → com.movvi.driver
// Os scripts em package.json copiam o arquivo correto antes de rodar `cap`.
const config: CapacitorConfig = {
  appId: "com.movvi.passenger",
  appName: "MOVVI",
  webDir: "dist/client",
};

export default config;
