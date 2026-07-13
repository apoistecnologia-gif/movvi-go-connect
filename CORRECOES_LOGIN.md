# MOVVI — Correções do Login e do APK Android (Passageiro)

## Causa real do travamento
Quatro problemas se somavam:

1. **`signInWithPassword` sem timeout.** Em redes ruins a Promise nunca
   resolvia, o `finally` do formulário não rodava e o botão "Entrar" ficava
   girando para sempre.
2. **Navegação sem `replace: true`.** Depois de logar, um "voltar" do
   sistema Android reabria o login, dando a sensação de "congelou ao entrar".
3. **Chrome web ("Voltar" / "Início") em cima do login.** O `AuthShell`
   renderizava um cabeçalho de site sobre o formulário — parecia página web
   dentro do APK.
4. **ZIP/Android nativo antigo.** O pacote testado ainda continha
   `targetSdkVersion 36` e uma `MainActivity` que chamava `requestFocus()` /
   `requestFocusFromTouch()` no WebView, exatamente a combinação que rompe a
   conexão IME: o teclado recebe toques, mas o `<input>` não recebe caracteres.

## Arquivos alterados

- `src/components/AuthShell.tsx`
  - `useAuthForm` agora envolve o submit em `withTimeout(..., 20_000)`.
    Se o Supabase não responder em 20s o botão volta ao estado normal com
    uma mensagem clara ("sem resposta do servidor").
  - `handle` ignora cliques duplos enquanto `loading` estiver `true`.
  - O cabeçalho com **Voltar** e **Início** só aparece na versão **web**;
    no APK (Capacitor) ou nos builds `VITE_APP_ROLE=passageiro|motorista`
    ele é omitido — aparência nativa.
  - Logo do topo deixou de ser um `<Link to="/">` (não deve navegar para
    a home institucional dentro do app).
- `src/lib/nativeBridge.ts`
  - `isNative()` agora é `export` — usado pelo `AuthShell` e por qualquer
    outro componente que precise diferenciar APK × web.
- `src/routes/passageiro.login.tsx`
  - Valida `data.session` e `data.user` antes de navegar.
  - `navigate({ to: "/passageiro/app", replace: true })`.
  - Logs `[passageiro.login] signIn start/ok` sem imprimir e-mail, senha,
    token, session ou qualquer dado sensível.
- `src/routes/motorista.login.tsx`
  - Mesmo tratamento com `replace: true` para `/motorista/app` e
    `/motorista/status`.
- `android-passageiro/app/src/main/java/com/movvi/passenger/MainActivity.java`
  - Voltou a ser Activity Capacitor mínima: `public class MainActivity extends BridgeActivity {}`.
- `android-passageiro/variables.gradle`
  - `targetSdkVersion = 34` durante a validação da digitação no APK.
- `scripts/verify-mobile-native.mjs`
  - Impede compilar APK com `targetSdkVersion 35/36`, `captureInput` incorreto
    ou `MainActivity` com manipulação de foco/autofill/soft input.
- `scripts/cap-sync.mjs`
  - Recria `android/` a partir de `android-passageiro/` a cada build, em vez de
    reutilizar uma pasta antiga.

## Motivo de cada alteração

- **Timeout duro no submit:** garante que o botão nunca fique preso.
- **Debounce por `loading`:** evita disparar dois `signInWithPassword`
  concorrentes quando o usuário clica duas vezes.
- **`replace: true`:** o back do Android não volta mais ao login depois de
  autenticado.
- **Chrome web escondido:** o APK precisa parecer nativo — nenhum
  breadcrumb, nenhum "Início".
- **Sem foco forçado no WebView:** o IME do Android deve se conectar
  diretamente ao `<input>` tocado pelo usuário.
- **Validação anti-regressão:** se o ZIP estiver antigo ou alguém reintroduzir
  `requestFocus()` na Activity, o build falha antes de gerar APK.

## Como gerar o APK

Em Windows / macOS / Linux, dentro da pasta descompactada:

```bash
npm install
npm run apk:passageiro
```

Depois abra no Android Studio:

```bash
npm run cap:open
```

Ou gere o APK Debug direto pelo Gradle:

```bash
npm run apk:passageiro
```

## Localização do APK

`android/app/build/outputs/apk/debug/app-debug.apk`

## O que este ZIP NÃO contém (proposital)

- `node_modules/`, `dist/`, `.output/`, `.tanstack/`
- `android-*/app/build/`, `android-*/build/`, `android-*/.gradle/`
- APKs antigos, caches, arquivos temporários
- Nenhuma pasta duplicada do projeto
