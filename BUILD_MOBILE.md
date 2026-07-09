# MOVVI — Build mobile (Android / Play Store)

Fase 3 da separação: empacotar os apps **MOVVI Passageiro** e **MOVVI Motorista**
como aplicativos Android nativos usando **Capacitor**, sem alterar backend
(Supabase), banco, autenticação, corridas, GPS, mapas, pagamentos, notificações
ou regras de negócio.

O **Painel Administrativo continua exclusivamente Web** — não é empacotado em
nenhum dos dois apps.

---

## 0. Pré-requisitos

- Node/Bun instalado (usado pela Lovable).
- **Android Studio** (Hedgehog+), com Android SDK + Platform Tools.
- Java 17 (embutido no Android Studio).
- Chave de assinatura Android (`.jks`) para gerar AAB de produção.
- Contas de publicação: Google Play Console (2 apps distintos).

---

## 1. Arquivos deste projeto

| Arquivo | Propósito |
| --- | --- |
| `capacitor.config.ts` | Config padrão (fallback do CLI). |
| `capacitor.passageiro.config.ts` | App do Passageiro — `com.movvi.passenger`. |
| `capacitor.motorista.config.ts` | App do Motorista — `com.movvi.driver`. |
| `src/lib/appRole.ts` | Flag `VITE_APP_ROLE` que isola as rotas. |
| `BUILD_MOBILE.md` | Este guia. |

Cada script de build define `VITE_APP_ROLE` antes do `vite build`, garantindo
que o bundle contenha apenas as rotas do papel correspondente. As rotas
`/admin/*` **nunca** entram nos apps porque o guard em `src/routes/__root.tsx`
já as bloqueia nos builds `passageiro` e `motorista`.

---

## 2. Scripts npm

Executáveis via `bun run <script>` (ou `npm run`):

- `build:passageiro` → `VITE_APP_ROLE=passageiro vite build`
- `build:motorista`  → `VITE_APP_ROLE=motorista vite build`
- `sync:passageiro`  → copia `capacitor.passageiro.config.ts` e roda `cap sync android`
- `sync:motorista`   → idem para motorista
- `android:passageiro` → build + sync + `cap open android`
- `android:motorista`  → idem para motorista

O build web padrão (`bun run build`) **continua idêntico** e serve site
institucional + painel admin em `movvi-go-connect.lovable.app`.

---

## 3. Fluxo — App do Passageiro

```bash
# 1. Gera bundle web só com rotas do passageiro
bun run build:passageiro

# 2. Na primeira vez, adiciona a plataforma Android
bunx cap add android          # só uma vez, depois de qualquer sync:passageiro

# 3. Sincroniza o bundle com o projeto Android
bun run sync:passageiro

# 4. Abre no Android Studio
bun run android:passageiro
```

No Android Studio:
1. `Build > Generate Signed Bundle / APK…`
2. Escolher **Android App Bundle (AAB)**.
3. Assinar com o keystore `movvi-passageiro.jks`.
4. Enviar o `.aab` para o Play Console do app **MOVVI**.

---

## 4. Fluxo — App do Motorista

Mesmos passos, trocando os scripts:

```bash
bun run build:motorista
bun run sync:motorista
bun run android:motorista
```

Keystore separado: `movvi-motorista.jks`. Enviar o `.aab` para o Play Console
do app **MOVVI Motorista** (`com.movvi.driver`).

> Os dois apps são projetos Android **independentes**. Recomendado manter
> pastas separadas ao versionar o `android/` (ex.: `android-passageiro/` e
> `android-motorista/`) se precisar dos dois projetos nativos coexistindo
> no mesmo checkout. Por padrão os scripts sobrescrevem `capacitor.config.ts`
> antes do `cap sync`, então rode um app por vez ou mantenha checkouts
> distintos por CI.

---

## 5. Como o Admin Web fica de fora

- Rotas `/admin/*` só estão acessíveis no build `web` (padrão).
- Nos bundles `passageiro` e `motorista`, o guard global em
  `src/routes/__root.tsx` redireciona qualquer acesso a `/admin/*` ou à área
  do outro papel para o login correto. O código das rotas admin até fica no
  bundle (mesmo repo), mas está inalcançável pela navegação e pelo menu.
- Nenhuma configuração Android referencia rotas `/admin`.

---

## 6. Backend / Supabase

**Nada muda.** Os dois apps continuam usando exatamente o mesmo:
- Projeto Supabase (mesmas tabelas, RLS, edge functions, storage).
- Chaves publicáveis via `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`).
- Fluxos de auth, corridas, GPS, mapas, pagamentos e notificações.

---

## 7. Riscos e pendências antes de publicar

1. **Push notifications nativas**: hoje o app usa Web Push. Para receber push
   com o app fechado no Android, será necessário adicionar
   `@capacitor/push-notifications` + Firebase Cloud Messaging e trocar o
   registro de token no `deviceTokenService`. Fora do escopo desta fase.
2. **Permissões nativas**: localização em background (motorista), câmera
   (upload de documentos) e microfone precisam ser declaradas em
   `AndroidManifest.xml` e solicitadas via `@capacitor/geolocation` /
   `@capacitor/camera` em fase futura.
3. **Deep links / OAuth**: se Google Sign-In for habilitado no mobile, o
   redirect precisa apontar para um esquema `com.movvi.passenger://` (ou
   `com.movvi.driver://`) e as URLs de callback registradas no Supabase.
4. **Rotas ainda não criadas**: `/motorista/sobre` e `/motorista/historico`
   permanecem pendentes (não faz parte desta fase criar rotas novas).
5. **SSR vs SPA**: TanStack Start gera bundle SSR. Para Capacitor usamos
   apenas o `dist/client`. Se alguma rota depender exclusivamente de
   `loader` server-side sem fallback client-side, testar antes de publicar.
6. **Ícones e splash**: gerar via `@capacitor/assets` (não incluso ainda).
7. **Versionamento**: `versionCode`/`versionName` devem ser incrementados em
   `android/app/build.gradle` a cada envio ao Play.

---

## 8. Confirmações

- ✅ Backend Supabase **inalterado**.
- ✅ Banco, RLS e edge functions **inalterados**.
- ✅ Corridas, GPS, mapas, pagamentos e notificações **inalterados**.
- ✅ Admin Web **fora** dos dois apps mobile.
- ✅ Build web padrão continua funcionando (`bun run build`).
- ✅ Dois `appId` distintos: `com.movvi.passenger` e `com.movvi.driver`.
- ✅ Nada foi publicado automaticamente na Play Store.
