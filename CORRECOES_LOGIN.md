# MOVVI — Correções do Login e do APK Android (Passageiro)

## Causa real do travamento
Três problemas se somavam:

1. **`signInWithPassword` sem timeout.** Em redes ruins a Promise nunca
   resolvia, o `finally` do formulário não rodava e o botão "Entrar" ficava
   girando para sempre.
2. **Navegação sem `replace: true`.** Depois de logar, um "voltar" do
   sistema Android reabria o login, dando a sensação de "congelou ao entrar".
3. **Chrome web ("Voltar" / "Início") em cima do login.** O `AuthShell`
   renderizava um cabeçalho de site sobre o formulário — parecia página web
   dentro do APK.

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

## Motivo de cada alteração

- **Timeout duro no submit:** garante que o botão nunca fique preso.
- **Debounce por `loading`:** evita disparar dois `signInWithPassword`
  concorrentes quando o usuário clica duas vezes.
- **`replace: true`:** o back do Android não volta mais ao login depois de
  autenticado.
- **Chrome web escondido:** o APK precisa parecer nativo — nenhum
  breadcrumb, nenhum "Início".

## Como gerar o APK

Em Windows / macOS / Linux, dentro da pasta descompactada:

```bash
npm install
npm run android:passageiro     # build SPA + cap sync android
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

`android-passageiro/app/build/outputs/apk/debug/app-debug.apk`

## O que este ZIP NÃO contém (proposital)

- `node_modules/`, `dist/`, `.output/`, `.tanstack/`
- `android-*/app/build/`, `android-*/build/`, `android-*/.gradle/`
- APKs antigos, caches, arquivos temporários
- Nenhuma pasta duplicada do projeto
