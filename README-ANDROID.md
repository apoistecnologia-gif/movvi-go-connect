# MOVVI — Build do APK Android (Passageiro / Motorista)

Este pacote empacota o app web MOVVI em um APK nativo via Capacitor.
Cada ZIP (`movvi-android-passageiro.zip` / `movvi-android-motorista.zip`)
já vem com a pasta `android/` pronta e a `capacitor.<role>.config.ts`
correta.

## Pré-requisitos

- Node.js 20+ e npm
- Android Studio (Hedgehog ou mais novo) com **JDK 21** (embutido)
- Cabo USB ou emulador Android para instalar o APK

## Passo a passo (Windows PowerShell / macOS / Linux)

Descompacte o ZIP, entre na pasta `pkg-passageiro/` (ou `pkg-motorista/`) e rode:

```bash
npm install
npm run apk:passageiro     # ou: npm run apk:motorista
```

O script único faz **tudo**:
1. `vite build --mode mobile` — gera `dist/client/` já com as chaves do
   `.env.mobile` embutidas (Supabase publishable + Google Maps).
2. `cap sync android` — copia o bundle para `android/app/src/main/assets/public/`.
3. `gradlew assembleDebug` — gera o APK em
   `android/app/build/outputs/apk/debug/app-debug.apk`.

Instale no aparelho:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## Abrir no Android Studio (para debug, assinar release, etc.)

```bash
npm run cap:open
```

## Como o APK conversa com o backend

- **Todas** as chamadas de servidor (rotas Google, corridas, geocoding,
  autenticação Supabase) são redirecionadas em tempo de execução pelo
  `src/lib/mobileFetchProxy.ts` para **https://movvi-go-connect.lovable.app**.
- Publique o app web na Lovable antes de testar o APK — o APK usa o
  backend publicado, não o preview.
- O CORS já foi liberado em `src/start.ts` para as origens Capacitor
  (`capacitor://localhost`, `https://localhost`, `http://localhost`).

## Solução de problemas

- **Tela branca**: verifique se `dist/client/index.html` foi gerado após o
  `build:*`. Se não, apague `.output/` e `dist/` e rode de novo.
- **EBUSY no Windows durante o build**: já mitigado (`nitro.externals.trace: false`
  em `vite.config.ts`). Se persistir, feche antivírus / OneDrive na pasta.
- **`invalid source release: 21`**: aponte `JAVA_HOME` para o JDK 21
  embutido do Android Studio.
- **APK abre mas rede não funciona**: confira que
  `https://movvi-go-connect.lovable.app` está publicado e acessível pelo
  celular (mesma rede não é obrigatória, mas precisa ter internet).
