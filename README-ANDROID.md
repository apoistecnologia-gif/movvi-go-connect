# MOVVI — Build Android (APK)

Este pacote contém o código-fonte completo do MOVVI + o projeto Android
nativo (Capacitor) pré-configurado para gerar o APK do **Passageiro** ou do
**Motorista**.

## Como funciona

O APK carrega apenas o SPA (interface React). Quando o app precisa de
backend (calcular rota, solicitar corrida, geocodificar, etc.), as chamadas
`createServerFn` são **redirecionadas automaticamente** para o backend já
publicado em `https://movvi-go-connect.lovable.app` — feito pelo
`src/lib/mobileFetchProxy.ts` que intercepta `window.fetch` só nos builds
mobile. O backend web e o APK usam **exatamente o mesmo servidor**.

Sessão Supabase, mapas, notificações in-app e realtime continuam
funcionando dentro do WebView.

## Pré-requisitos

- Node.js 20+ e npm
- Android Studio Iguana ou mais recente (com JDK 21 embutido)
- Windows, macOS ou Linux

## Passo a passo (Windows / PowerShell)

Descompacte o ZIP e entre na pasta raiz (`pkg-passageiro/` ou
`pkg-motorista/`). Depois:

```powershell
npm install
npm run android:passageiro        # ou: npm run android:motorista
npm run cap:open
```

- `npm install` — instala dependências (inclui @capacitor/android, obrigatório).
- `npm run android:*` — gera o bundle web mobile (`dist/client/`) com as
  chaves de API embutidas de `.env.mobile` e faz `cap sync android`.
- `npm run cap:open` — abre o projeto Android Studio.

No Android Studio: **Build → Build Bundle(s)/APK(s) → Build APK(s)**.

## Se der erro no build web

Se o build reclamar de falta de `.env`, verifique que `.env.mobile` está
presente na raiz. Ele já contém as chaves publishable necessárias
(Supabase publishable key + Google Maps browser key). Todas são chaves
públicas — não colocar service_role aqui.

## Se a tela ficar branca no celular

1. Confirme que `dist/client/index.html` foi gerado após `npm run android:*`.
2. Confirme que `android/app/src/main/assets/public/` foi populado pelo
   `cap sync`.
3. No dispositivo, ative depuração USB e abra `chrome://inspect` para ver
   o console — geralmente é uma chamada de rede bloqueada por CORS. Se
   for, verifique se a origem do WebView (`capacitor://localhost` ou
   `https://localhost`) está na lista `CAPACITOR_ORIGINS` em
   `src/start.ts`.

## Push notifications e permissões nativas

Este ZIP **não** inclui @capacitor/push-notifications, Firebase, nem
`google-services.json`. Notificações in-app (com o app aberto) funcionam
via `Notification` API do WebView. Push com o app fechado exige integração
FCM que não está nesta fase.

Permissões de GPS, câmera e mídia são declaradas no `AndroidManifest.xml`
mas as chamadas de runtime usam APIs do navegador dentro do WebView. Em
Android 13+, o sistema solicita permissões automaticamente na primeira
vez que a API é invocada.

## Compatibilidade

- **Android mínimo**: 7.0 (API 24)
- **JDK**: 21 (o Android Studio moderno embute; fora dele, configure
  `JAVA_HOME` para uma instalação JDK 21).
