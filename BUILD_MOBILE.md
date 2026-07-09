# MOVVI — Build mobile Android (Play Store)

Fase 4 concluída: os dois aplicativos Android já estão **gerados e prontos
para abrir no Android Studio**. Este guia explica passo a passo, sem
pressupor conhecimento prévio da ferramenta.

| App | Pasta no projeto | Package ID | Nome exibido |
| --- | --- | --- | --- |
| MOVVI (passageiro) | `android-passageiro/` | `com.movvi.passenger` | MOVVI |
| MOVVI Motorista | `android-motorista/` | `com.movvi.driver` | MOVVI Motorista |

O painel **Admin continua exclusivamente web** e não é empacotado em nenhum
dos dois apps.

---

## 0. O que já foi feito por você

- Bundle web gerado com `VITE_APP_ROLE` correto para cada app.
- Projetos Android nativos criados em `android-passageiro/` e `android-motorista/`.
- `AndroidManifest.xml` com permissões (INTERNET, GPS foreground/background,
  CÂMERA, NOTIFICAÇÕES, VIBRATE, WAKE_LOCK, FOREGROUND_SERVICE).
- Ícones (mipmap-hdpi..xxxhdpi + adaptive) e splash screens gerados a partir
  dos assets em `resources/`.
- `applicationId`, `versionCode = 1`, `versionName = "1.0"` configurados em
  `app/build.gradle` de cada projeto.
- `strings.xml` com o nome de exibição correto (MOVVI / MOVVI Motorista).
- `capacitor.config.json` correto embutido em cada projeto (`com.movvi.passenger`
  / `com.movvi.driver`).

---

## 1. O que baixar

Dois arquivos ZIP prontos, um por app:

- `movvi-android-passageiro.zip` — projeto Android do app do Passageiro.
- `movvi-android-motorista.zip` — projeto Android do app do Motorista.

Ambos aparecem no chat como anexos para download. Cada ZIP é um projeto
Android **independente e completo** — não precisa do restante do repositório
para compilar.

---

## 2. Instalar o Android Studio (uma única vez)

1. Baixe em <https://developer.android.com/studio> a versão para seu sistema.
2. Instale com as opções padrão.
3. Na primeira abertura, escolha **Standard Setup**. O instalador baixará
   automaticamente o Android SDK, Platform Tools e o emulador. Aceite todas
   as licenças. Pode demorar 15-30 minutos.
4. Feche o Android Studio quando terminar.

---

## 3. Abrir um projeto no Android Studio

1. Descompacte o ZIP (ex.: `movvi-android-passageiro.zip`) numa pasta sem
   espaços nem acentos (ex.: `C:\movvi\android-passageiro` ou
   `~/movvi/android-passageiro`).
2. Abra o Android Studio.
3. Clique em **Open** na tela inicial (ou **File > Open** se já estiver aberto).
4. Selecione a pasta descompactada (ex.: `android-passageiro`) — **não** entre
   dentro dela, apenas selecione-a — e clique em **OK**.
5. Aguarde o "Gradle Sync" terminar (barra de progresso embaixo). Na primeira
   vez baixa dependências e pode levar 5-15 minutos.
6. Quando terminar, no canto superior esquerdo, mude a visualização de
   **Android** para **Project** para ver a árvore de pastas se quiser.

Repita os mesmos passos para o segundo ZIP quando for gerar o outro app.

---

## 4. Gerar o APK (para testar no seu celular)

APK é o arquivo `.apk` que você instala direto num aparelho Android — bom
para testes. **Não** serve para publicar na Play Store; para isso use o AAB
(seção 5).

1. No menu superior: **Build > Build App Bundle(s) / APK(s) > Build APK(s)**.
2. Aguarde o Gradle compilar. Ao terminar, aparece uma notificação no canto
   inferior direito com o link **locate**. Clique em **locate**.
3. O arquivo estará em:
   `app/build/outputs/apk/debug/app-debug.apk`
4. Transfira esse `.apk` para o celular (USB, e-mail, Drive) e abra no
   dispositivo. Aceite "Instalar de fonte desconhecida" quando pedir.

> APKs de debug não são aceitos pela Play Store. Use-os apenas para testar.

---

## 5. Gerar o AAB assinado (para publicar na Play Store)

AAB é o **Android App Bundle** — o formato que a Play Store exige.

### 5.1. Criar sua chave de assinatura (uma vez por app)

Cada app precisa de um keystore próprio. **Guarde esse arquivo e as senhas
em local seguro** — sem ele você não consegue atualizar o app depois.

1. No Android Studio: **Build > Generate Signed Bundle / APK…**
2. Escolha **Android App Bundle** e clique **Next**.
3. Em **Key store path**, clique **Create new…**
4. Preencha:
   - **Key store path**: `C:\movvi\movvi-passageiro.jks` (ou similar).
   - **Password / Confirm**: crie uma senha forte (guarde!).
   - **Alias**: `movvi-passageiro`.
   - **Password (do alias)**: pode ser a mesma da store (guarde!).
   - **Validity**: 25 anos ou mais.
   - **Certificate**: preencha nome, empresa e país.
5. Clique **OK**. O `.jks` é criado.

Repita para o app do motorista com nome `movvi-motorista.jks`.

### 5.2. Gerar o AAB assinado

1. **Build > Generate Signed Bundle / APK…**
2. **Android App Bundle > Next**.
3. Selecione o keystore criado, digite as senhas e o alias.
4. Marque **Remember passwords** se quiser (opcional).
5. Em **Build Variants**, selecione **release** e clique **Create**.
6. Aguarde o build. Ao terminar, clique em **locate** na notificação.
7. O arquivo estará em:
   `app/release/app-release.aab`
8. Esse `.aab` é o que você envia no **Play Console > seu app > Produção >
   Criar nova versão**.

---

## 6. Antes de subir na Play Console

Cada app é um cadastro **separado** na Play Console:

1. Crie o app com o mesmo `applicationId` (`com.movvi.passenger` ou
   `com.movvi.driver`).
2. Preencha ficha da loja: nome, descrição curta e completa, ícone 512x512
   (use `resources/icon-passageiro.png` ou `resources/icon-motorista.png`),
   screenshots do celular (mínimo 2), banner de destaque 1024x500.
3. Preencha o **Questionário de Conteúdo** e **Público-alvo**.
4. Preencha a **Política de Privacidade** (URL): reuse a página já publicada
   em `https://movvi-go-connect.lovable.app/passageiro/privacidade`
   (ou `/motorista/privacidade`).
5. Envie o `.aab` em **Produção > Criar nova versão**.
6. A primeira revisão do Google costuma levar 3-7 dias.

---

## 7. Como atualizar um app depois

Toda vez que quiser mandar uma nova versão:

1. Abra `app/build.gradle` do projeto Android e **incremente**:
   ```gradle
   versionCode 2      // sempre +1
   versionName "1.1"  // livre, ex.: 1.1, 1.2, 2.0
   ```
2. Rode `bun run android:passageiro` (ou `android:motorista`) no
   repositório principal para atualizar o bundle web dentro do projeto
   Android. Isso executa build + `cap sync`.
3. Copie a pasta `android-passageiro/` (ou `android-motorista/`) atualizada
   para sua máquina, sobrescrevendo a anterior — **preserve o `.jks` fora
   da pasta**.
4. Repita a seção 5.2 (Generate Signed Bundle) usando o **mesmo keystore**
   original. Sem ele o Play Console rejeita a atualização.

---

## 8. Permissões declaradas

**Passageiro** (`com.movvi.passenger`):
- Internet + estado da rede
- GPS fine + coarse (localização em corridas ativas)
- Câmera + galeria (foto de perfil)
- Notificações + vibração + wake lock

**Motorista** (`com.movvi.driver`) — mesmas do passageiro +
- GPS em background (para manter localização durante corrida)
- `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_LOCATION`
- Requer aparelho com GPS

O usuário sempre é solicitado no primeiro uso. GPS em background exige que
o usuário aceite manualmente "Permitir sempre" nas configurações do
Android — isso é regra da Google, não do app.

---

## 9. O que continua igual (nada mudou no backend)

- Supabase, banco, RLS e edge functions: **inalterados**.
- Auth, corridas, GPS, mapas, pagamentos, notificações: **inalterados**.
- Domínio web (`movvi-go-connect.lovable.app`) continua servindo site +
  painel admin normalmente.
- Os dois apps consomem exatamente os mesmos endpoints que o web.

---

## 10. Riscos conhecidos (deixados propositalmente para depois)

1. **Push nativo (FCM)**: hoje o app usa Web Push, que funciona apenas com
   app aberto. Para push com app fechado no Android é preciso integrar
   `@capacitor/push-notifications` + Firebase Cloud Messaging. Fora do
   escopo desta fase.
2. **Google Sign-In no mobile**: precisa configurar deep link
   `com.movvi.passenger://` / `com.movvi.driver://` como URL de callback
   no Supabase. Fora do escopo desta fase.
3. **Rotas ainda não criadas**: `/motorista/sobre` e `/motorista/historico`.
4. **SSR vs SPA**: TanStack Start gera bundle SSR. O script
   `scripts/postbuild-capacitor.mjs` monta um `index.html` estático em
   `dist/client/` para o WebView. Se alguma rota depender exclusivamente
   de `loader` server-side, testar no dispositivo antes de publicar.
5. **Ícones/splash**: gerados a partir de `resources/icon-*.png` e
   `resources/splash-*.png`. Para arte final, substitua esses arquivos e
   rode `bunx capacitor-assets generate --android` seguindo o processo em
   `scripts/postbuild-capacitor.mjs`.

---

## 11. Comandos de bolso (referência rápida)

```bash
# Regerar o projeto Android do passageiro (bundle + sync)
bun run android:passageiro

# Regerar o projeto Android do motorista (bundle + sync)
bun run android:motorista

# Build web padrão (site + admin) — não muda
bun run build
```

Nada é publicado automaticamente. Os arquivos `.aab` só chegam à Play Store
quando **você** enviar manualmente pelo Play Console.
