## Estratégia: proxy de rede no APK, não reescrita de backend

O diagnóstico está certo — o APK não tem servidor TanStack rodando dentro dele. Mas a solução **não precisa** ser migrar `computeRoute`, `requestRide`, `cancelRide`, `geocode`, `nearby`, `driverAuth`, `driverDocs`, todos os `admin*.functions.ts`, etc., para Supabase Edge Functions. Isso seria:

- ~30 arquivos `.functions.ts` para migrar
- perda de tipagem end-to-end do `useServerFn`
- retrabalho no admin/web (que já usa esses server fns via SSR)
- semanas de trabalho e alta chance de regressão

O TanStack Start **já publica** cada `createServerFn` como endpoint HTTP em `https://movvi-go-connect.lovable.app/_serverFn/<hash>`. A web em produção funciona. O que falta é: **quando rodando dentro do Capacitor, redirecionar essas chamadas para a URL publicada** em vez de `https://localhost/_serverFn/...`.

## O que vou fazer

### 1. Interceptor de fetch para o build mobile (1 arquivo novo)
`src/lib/mobileFetchProxy.ts` — intercepta `window.fetch` quando `VITE_APP_ROLE=passageiro|motorista`, e reescreve qualquer URL relativa (`/_serverFn/*`, `/api/*`) para `https://movvi-go-connect.lovable.app<path>`. Anexa cookies de sessão via `credentials: 'include'` + header `Authorization: Bearer <supabase-token>`.

Registrado uma única vez em `src/router.tsx` (ou `src/routes/__root.tsx`), guardado por `if (typeof window !== 'undefined' && isMobileBuild())`.

### 2. CORS no servidor publicado
Server routes já rodam com mesma origem no web. Preciso liberar CORS para a origem do WebView Capacitor (`https://localhost`, `capacitor://localhost`, `http://localhost`) nos endpoints `/_serverFn/*` e `/api/*`. TanStack Start expõe isso via middleware em `src/start.ts` — adiciono `requestMiddleware` que responde OPTIONS e injeta `Access-Control-Allow-*` headers para essas origens.

### 3. Embutir chaves no bundle mobile
Criar `.env.mobile` (versionado, só chaves publishable) com `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`. Ajustar `package.json` scripts `android:passageiro` e `android:motorista` para carregar esse env (`dotenv-cli` ou `cross-env` inline) antes do `vite build`.

### 4. Corrigir `scripts/cap-sync.mjs`
Salvar o conteúdo original de `capacitor.config.ts` (se existir) num buffer antes de sobrescrever, e restaurar no `finally` em vez de sempre apagar.

### 5. Documentar em `README-ANDROID.md`
Comandos finais (Windows/PowerShell):
```
npm install
npm run android:passageiro   # já builda + sync + copia dist/client
npm run cap:open
```
Depois Android Studio → Build APK.

## O que fica FORA deste plano (frentes 2 e 3 que você não priorizou)

- Push notifications nativo (FCM + google-services.json)
- Plugins Capacitor para geolocation/camera runtime
- Migração real para Edge Functions (só faria sentido se o web fosse desligado)

Faremos em turnos separados se você pedir.

## Riscos e mitigação

- **Latência**: chamadas agora vão pela internet até `movvi-go-connect.lovable.app` em vez de localhost. Aceitável — já é o comportamento no web.
- **Sessão Supabase**: o cliente Supabase persiste em `localStorage` do WebView, funciona igual. O `attachSupabaseAuth` continua injetando o bearer.
- **CORS**: liberar apenas as origens Capacitor (`capacitor://localhost`, `https://localhost`), não `*`, mantendo credenciais.
- **Se `movvi-go-connect.lovable.app` cair**, o APK também cai. Mesmo risco do web hoje.

## Detalhes técnicos

- O `.url` de cada server fn é resolvido em runtime como caminho relativo — o interceptor precisa rodar **antes** do primeiro `useServerFn` disparar (por isso é registrado no bootstrap do router).
- Fetch nativo do Capacitor honra `credentials: 'include'` desde que o servidor devolva `Access-Control-Allow-Credentials: true` com origem específica.
- `VITE_APP_ROLE` já existe e é lido em `src/lib/appRole.ts` — reuso a mesma checagem.
