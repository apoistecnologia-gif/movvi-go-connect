# Design System Oficial MOVVI — Fase Final

Este é um trabalho de **padronização visual em todo o app**, não uma correção pontual. Vou tratá-lo em ondas para garantir consistência sem quebrar telas em produção. Nenhuma lógica, backend, GPS, despacho, lifecycle, rota, estado ou regra de negócio será tocada.

## Escopo por ondas

### Onda 1 — Tokens oficiais (`src/styles.css`)
Fonte única da verdade. Toda tela vai consumir estas variáveis.

- **Cores**: `--movvi-green` (#76C139), `--movvi-green-strong` (#5A9A2A), `--movvi-green-soft`, `--movvi-dark` (#111418), `--surface`, `--surface-2`, `--stroke`, `--divider`, `--muted-ink` (#707070). Eliminar `#76C139` cru, `#5A9A2A`, `#111418`, `#707070`, `#94A3B8` espalhados.
- **Radius**: `--radius-xs 8`, `--sm 12`, `--md 16`, `--lg 20`, `--xl 26` (sheet).
- **Espaçamento**: escala 4/8/12/16/20/24/28/32 exposta como `--space-1..8`.
- **Sombras**: `--shadow-card`, `--shadow-floating`, `--shadow-sheet`, `--shadow-cta`.
- **Tipografia**: `--text-title-xl/lg/md`, `--text-body-lg/md/sm`, `--text-caption`, `--text-price`, com `line-height` e `letter-spacing` fixos.
- **Motion**: `--dur-fast 160ms`, `--dur-base 220ms`, `--dur-slow 320ms`, `--ease-out cubic-bezier(.2,.7,.2,1)`.
- Mapear tokens no `@theme inline` para gerar utilitários (`bg-surface`, `text-ink`, `rounded-md`, `shadow-card`, `text-title-md`).

### Onda 2 — Primitivos unificados (`src/design-system/`)
Um único componente por função. Screens migram para eles.

- `DSButton` (variantes primary/secondary/ghost/destructive, estados busy/disabled, altura 48 padrão / 40 compact, radius `md`, mesma animação `active:scale-[0.98]`).
- `DSCard` já existe — alinhar `variants` aos novos tokens (radius `lg`, padding `space-3`, `shadow-card`, `border-stroke`).
- `DSIcon` wrapper `lucide` com tamanhos `sm 14 / md 16 / lg 18 / xl 22` e `strokeWidth` fixo 1.75.
- `DSChip` (para "MOVVI Preço", ETA, tag "perto").
- `DSSectionLabel` (uppercase `caption` cinza — usada em "Local de embarque", "Embarque", "Destino", "Valor", "Pagamento").
- Confirmar `MovviSheet` já usando `--radius-xl` e `--shadow-sheet`.

### Onda 3 — Migração das telas do passageiro
Substituir hardcodes por tokens/primitivos, sem mexer em lógica ou estado.

- `src/routes/passageiro.app.tsx` — header, card embarque, seletor de categoria, confirmação, buscando motorista, corrida ativa, envios.
- `src/routes/passageiro.corridas.tsx`, `passageiro.perfil.tsx`, `passageiro.configuracoes.tsx`, `passageiro.favoritos.tsx` — cards, botões, tipografia.
- Componentes compartilhados: `MovviHeader`, `PassengerSideMenu`, `BottomSheet`, `BottomNav`, `MovviMap` (só chrome), `ProfileHero`, `NotificationPermissionPrompt`.

### Onda 4 — Migração das telas do motorista
Mesmo tratamento, mesmos tokens.

- `src/routes/motorista.app.tsx`, `motorista.perfil.tsx`, `motorista.ganhos.tsx`, `motorista.corridas.tsx`, `motorista.documentos.tsx`, `motorista.configuracoes.tsx`, `motorista.status.tsx`, `motorista.assinatura.tsx`, `motorista.suporte.tsx`, etc.
- `DriverSideMenu`, `DriverInfoCard`, `DriverProfessionalProfile*`.

### Onda 5 — Limpeza
- Remover `BottomSheet.tsx` antigo se não referenciado (auditar); manter `MovviSheet` como único.
- Podar imports não usados detectados pelo TS strict.
- Excluir CSS/tokens legados em `src/styles.css` que ficarem órfãos.
- Rodar typecheck no fim de cada onda.

## Fora de escopo (explicitamente)
- Nada em `src/integrations/supabase/*`, `src/lib/*` de dados, hooks de GPS, dispatch, lifecycle, `routes/api/*`, migrations, edge functions.
- Nenhuma tela `admin.*` — o admin tem outro padrão visual e não faz parte do produto passageiro/motorista referenciado (Uber/99/inDrive). Confirmar antes se você quer o admin incluído.
- `src/routes/__root.tsx`, `router.tsx`, `start.ts` — só se um token global precisar ser exposto lá.

## Detalhes técnicos

- Tokens declarados em `@theme` (Tailwind v4) — utilitários `rounded-md`, `shadow-card`, `text-title-md` passam a existir no autocomplete.
- Cores com alfa: usar `color-mix(in oklab, var(--movvi-green) 12%, transparent)` em vez de `bg-[#76C139]/12` cru para não fugir do token.
- `DSButton` unifica os múltiplos "botões verdes" atuais (`RequestRideButton`, botão Continuar, CTAs de perfil) — mesma altura, mesmo radius `md`, mesma sombra `shadow-cta`, mesma animação.
- Ícones migram para `DSIcon` progressivamente; qualquer `h-[Npx] w-[Npx]` fora da escala vira `size="md"`.
- Nenhum arquivo `.gen.ts` é editado. Não crio nem removo rotas.
- Testes visuais rápidos por onda: build (`tsgo`) + inspeção do preview em mobile e desktop.

## Entrega
Sequencial, uma onda por turno para você validar antes de eu avançar. Começo pela Onda 1 (tokens) assim que aprovar — ela sozinha já não muda pixel algum, só cria a base para as ondas 2–5 refatorarem sem risco.

## Pergunta antes de começar
1. Incluir o painel **admin** (`src/routes/admin.*`) nesta padronização, ou deixar de fora?
2. Posso remover o `src/components/BottomSheet.tsx` antigo se não houver imports (auditando primeiro)?
