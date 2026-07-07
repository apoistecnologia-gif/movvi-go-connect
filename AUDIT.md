# MOVVI — Auditoria do Projeto

Data: 2026-07-07
Escopo: Segurança & empacotamento · Qualidade de código · Performance · UX/A11y/Responsividade
Modo: **somente relatório**. Nenhum arquivo de negócio foi alterado.

Legenda de prioridade:
- **P0** — corrigir antes do próximo release (segurança / bug funcional / risco de dado).
- **P1** — corrigir na próxima janela de manutenção (risco moderado / dívida clara).
- **P2** — melhoria / higiene (ganho de qualidade, sem risco imediato).

---

## 1. Segurança & Empacotamento

### P0 — Backend / Supabase

1. **`app_settings` legível por qualquer usuário autenticado.**
   Política `app_settings_read` usa `USING (true)` para `authenticated`. Qualquer conta recém-criada lê configurações internas da plataforma (timeouts, chaves de recurso, toggles de pagamento).
   Ação: restringir SELECT a admins via `private.has_role`, espelhando a política de escrita. Se algum campo precisar ser público para o app, expor via view/RPC filtrada.

2. **`driver_amenities` legível por qualquer autenticado.**
   Política "Anyone authenticated can view amenities" usa `USING (true)`. Vaza catálogo de comodidades por motorista para qualquer conta.
   Ação: escopar SELECT ao próprio motorista, admins e passageiros com corrida ativa naquele motorista (padrão já usado em outras tabelas do projeto).

3. **19 avisos do linter Supabase sobre `SECURITY DEFINER` executável por `anon`/`authenticated`.**
   Funções `SECURITY DEFINER` no schema `public` estão com `EXECUTE` aberto. Se alguma delas fizer bypass de RLS (ex.: `has_role`, RPCs de dispatch/preço/roles), o risco é escalonamento de privilégio.
   Ação: para cada função listada pelo linter, decidir: (a) `REVOKE EXECUTE … FROM anon, authenticated` e `GRANT` só para os papéis certos; (b) trocar para `SECURITY INVOKER`; ou (c) mover para schema `private`. Documentar a decisão por função.

### P1 — Backend / Supabase

4. **Extension em `public`.** Mover para schema dedicado (ex.: `extensions`) em migration futura — evita conflito de nomes e reduz superfície pública.
5. **Webhooks públicos (`asaas-webhook`, `mercadopago-webhook`).** Confirmar que **toda** rota valida assinatura HMAC/token *antes* de qualquer `select`/`update` no banco. Registrar em log só ID de evento, nunca o corpo bruto (evita PII em logs).
6. **Cron `renew-driver-subscriptions`.** Verificar se exige `CRON_SECRET` no header e faz `timingSafeEqual` (não comparação com `===`).
7. **`service_role`.** Confirmar que o `supabaseAdmin` só é importado em arquivos `*.server.ts` e nunca chega ao bundle do cliente. Se algum `*.functions.ts` importar direto no topo, mover para `await import(...)` dentro do handler.

### P0 — Empacotamento / Repositório

8. **`.env` ainda presente na raiz com valores reais.**
   O arquivo `EXPORT_SECURITY.md` já orienta, mas o `.env` continua no diretório. É plataforma-gerenciado, então dentro da Lovable está ok — o risco é humano no momento de exportar ZIP/git. Manter o aviso no README além do `EXPORT_SECURITY.md`.
9. **`.gitignore` não lista `.workspace/`, `.tanstack/`, `.lovable/`, `tsconfig.tsbuildinfo`, `.env`.** Adicionar essas entradas explicitamente para o caso de export.

### P1 — Superfície do app

10. **Rotas de debug em produção.** `src/routes/debug.motorista-auth.tsx`, `src/routes/dev-diagnostics.tsx`, `src/routes/dev.rating-test.tsx`, `src/routes/map-test.tsx` estão em `src/routes/` sem gate visível.
    Ação: garantir que estejam sob `DevOrAdminGuard` (o guard existe em `src/components/DevOrAdminGuard.tsx` — confirmar aplicação em cada uma) ou movê-las para fora do build de produção.
11. **`avatar_url` legado com `signedUrl`.** `src/routes/motorista.perfil.tsx:169-173` ainda grava `signedUrl` no state e depois `path` no banco — mistura ok, mas o comentário/tipo do `ProfilePhotoUploader` ainda promete `signedUrl`. Padronizar o contrato do componente para deixar claro: `signedUrl` só preview, `path` persistido.

### P2

12. **`console.log` em produção.** 88 ocorrências em `passageiro.app.tsx`, 33 em `motorista.app.tsx`, 24 em `geocode.functions.ts`. Podem vazar coordenadas, IDs, payloads. Substituir por logger com nível (`debug`/`info`/`error`) e stripar `debug` em build de produção via `vite` `define`.
13. **`INTEGRATION_AUDIT.md` e `EXPORT_SECURITY.md`** viverão sem manutenção. Adicionar `Last-Reviewed:` no topo de cada e uma nota "revisar a cada release".

---

## 2. Qualidade de código

### P0

14. **Arquivos gigantes.**
    - `src/routes/passageiro.app.tsx` — **5.212 linhas**
    - `src/routes/motorista.app.tsx` — **2.573 linhas**
    - `src/lib/rideLifecycle.ts` — 922 linhas
    Impacto: qualquer alteração toca uma superfície enorme; risco de regressão alto; HMR lento; typecheck lento.
    Ação (sem mudar regra de negócio): extrair por *estado do fluxo*, mantendo arquivos-fachada e movendo puramente UI/hooks para arquivos irmãos:
    - `passageiro.app.tsx` → `passageiro/app/{IdleSheet,RequestingSheet,AssignedSheet,InRideSheet,RatingSheet,useActiveRide,useCameraFit}.tsx`
    - `motorista.app.tsx` → `motorista/app/{OfflinePanel,OnlinePanel,IncomingRequest,PickupSheet,InRideSheet,SummarySheet,useOnlineToggle}.tsx`
    Nenhum handler/RPC/subscribe precisa mudar; só relocalização.

### P1

15. **Duplicação `avatar_url ?? passenger_photo_url ?? null`** repetida em 5 pontos de `motorista.app.tsx` (linhas 1483, 1803, 1957, 2067, 2452). Extrair para `pickPassengerPhoto(passenger, ride)`.
16. **`ratingFlow.test.ts` está em `src/lib/`.** Testes junto do código de produção viram bundle. Mover para `tests/unit/` ou renomear e configurar `vitest` para incluir. `test:unit` roda com `--passWithNoTests`, então hoje ele passa sem rodar nada.
17. **`bun run test` só roda lint + typecheck.** `test:unit` está com `--passWithNoTests` (0 assertivas rodam). `test:e2e` depende de servidor de pé. CI não valida nada de lógica.
    Ação: adicionar pelo menos 3–5 unit tests em `rideLifecycle.ts` (cálculo de preço, escolha de motorista, transições de status) e amarrar ao `bun run test`.
18. **`any` em rotas críticas.** 13 em `passageiro.app.tsx`, 11 em `rideLifecycle.ts`. Trocar por tipos do `Database` gerado (`src/integrations/supabase/types.ts`).
19. **`geocode.functions.ts` — 610 linhas / 24 `console.log`.** Quebrar em `geocode.ts` (cliente) + `geocode.server.ts` (chamadas de API), remover logs verbosos.

### P2

20. **Convenções.** Padronizar: `*.functions.ts` = server function, `*.server.ts` = helper server-only, `*.ts` = compartilhado. Um sweep para renomear os que não seguem.
21. **Componentes `Sheet`.** `MovviSheet.tsx` (350 linhas) tem lógica de snap-point + drag misturada com estilo. Extrair `useSnapSheet` para reuso e teste isolado.
22. **`ProfilePhotoUploader` API confusa** (`signedUrl` no callback já obsoleto). Renomear o payload para `{ previewUrl, path }` — deixa o contrato honesto.

---

## 3. Performance

### P1

23. **Realtime subscriptions em dobra.** Passageiro subscribe em `rides` + `users` + `notification_inbox`; motorista subscribe em `drivers` + `rides` + broadcast. Auditar `useEffect`s: em cada mount há risco de canal duplicado se a limpeza não cobrir todos os paths (`visibilitychange`/`focus`/`online`). Adicionar log de `channel.state` em dev e limitar a **um canal por tópico** com `supabase.removeAllChannels()` no unmount raiz.
24. **`fitBounds` chamado a cada render.** No `passageiro.app.tsx` e `motorista.app.tsx`, mudança de snap do sheet dispara re-fit. Debounce em 250ms e cache das últimas `LatLngBounds` para evitar reflow do mapa.
25. **`recharts` + `jspdf` + `jspdf-autotable`** entram no bundle admin. Verificar se estão em rotas admin (deveriam) e se estão sendo *lazy-loaded* via `React.lazy`/`import()`. Se não, o passageiro/motorista está baixando ~250KB desnecessário.
26. **`@react-google-maps/api`** carrega o SDK inteiro. Confirmar `libraries=["places"]` só onde necessário; evitar múltiplas cópias de `LoadScript`.
27. **Sem índice em queries frequentes.** Rodar `supabase--slow_queries` no ambiente com tráfego real. Candidatos prováveis a índice: `rides(status, created_at)`, `rides(driver_id, status)`, `rides(passenger_id, status)`, `notification_inbox(user_id, created_at desc)`.

### P2

28. **`recharts` no admin sem memoização.** Componentes de gráfico devem `React.memo` os datasets já normalizados.
29. **Imagens de perfil** — sem `loading="lazy"`, sem `width`/`height` explícitos. Simples de corrigir no `<Avatar>`.

---

## 4. UX / Acessibilidade / Responsividade

### P1

30. **Contraste em modo escuro.** Já existe `tests/e2e/passenger-contrast.e2e.py` — bom sinal — mas não roda em CI. Adicionar ao pipeline; hoje regressões passam silenciosamente.
31. **Ordem de foco no bottom sheet.** Ao expandir/recolher o sheet o foco do teclado não migra. Screen readers anunciam a mudança errada. Adicionar `role="dialog"` + `aria-expanded` + trap opcional.
32. **Botões só-ícone sem `aria-label`.** Auditar `MovviHeader.tsx`, `PassengerSideMenu.tsx`, `DriverSideMenu.tsx` e o botão "centralizar" do mapa. `lucide-react` renderiza `<svg>` sem texto.
33. **Toques < 44px.** O botão "centralizar" está `h-12 w-12` (48px, ok), mas ícones do rodapé em algumas rotas admin ficam em 32px. Validar com `outline` de a11y.
34. **`viewport-fit=cover` + safe-area.** Confirmar em `src/routes/__root.tsx` que `<meta viewport ... viewport-fit=cover>` está presente para o `env(safe-area-inset-*)` funcionar em iOS notch.
35. **Estados vazios / erro / offline.** Muitas telas admin (`admin.corridas`, `admin.suporte`, `admin.financeiro`) assumem "sempre carrega". Sem `errorComponent`/`notFoundComponent` explícito por rota, um erro 500 quebra a UI toda.

### P2

36. **Textos hard-coded em PT-BR.** Sem infraestrutura de i18n. Se o produto for expandir, criar `src/i18n/pt-BR.ts` como fonte única já ajuda mesmo sem trocar de idioma.
37. **Metadata SEO.** Rotas públicas (`/`, `/download`, `/t/$token`) devem ter `head()` com `title`, `description`, `og:*`. Hoje o `__root.tsx` provavelmente serve o mesmo título em todas.
38. **PWA.** App é 100% mobile-first e passa horas aberto para o motorista — forte candidato a manifest + service worker (cache de tiles de mapa, ícone na home, splash). Não trivial, mas de alto ROI.
39. **`BrandSplash.tsx`** — verificar se está sendo desmontado após primeira render (senão vira ~205 linhas de JSX permanente).

---

## 5. Coisas para REMOVER

- `tsconfig.tsbuildinfo` da raiz (adicionar ao `.gitignore`).
- Rota `map-test.tsx`, `dev.rating-test.tsx`, `debug.motorista-auth.tsx` — mover para trás de `DevOrAdminGuard` ou deletar antes de publicar.
- `src/lib/ratingFlow.test.ts` — mover para `tests/`.
- `dispatch-broadcast-test` edge function (9 linhas) — se é teste, remover; se é usada por cron/admin, renomear sem "test".
- 88 `console.log` em `passageiro.app.tsx` — reduzir para os essenciais atrás de flag.

---

## 6. Coisas para ACRESCENTAR

- Suite de unit tests para `rideLifecycle.ts` (fluxo puro, sem Supabase — mockar client).
- CI job rodando `bun run test` + `tests/e2e/passenger-contrast.e2e.py` em cada PR.
- `src/lib/logger.ts` com níveis + stripping em produção via Vite `define`.
- `errorComponent` + `notFoundComponent` padrão em rotas admin.
- Índices Postgres nas colunas de query quente (ver item 27).
- Manifest PWA + ícone + `theme-color` — motoristas rodam o app o dia todo.
- README com seção "Como rodar localmente / como exportar" apontando para `EXPORT_SECURITY.md`.

---

## Resumo por prioridade

| Prio | Itens | Onde dói |
|------|-------|----------|
| **P0** | 1, 2, 3, 8, 14 | Vazamento de config, escalonamento potencial, dívida de refactor bloqueando manutenção |
| **P1** | 4–7, 9–11, 15–19, 23–27, 30–35 | Higiene de backend, testes de fato rodando, performance de app real |
| **P2** | 12, 13, 20–22, 28, 29, 36–39 | Polimento, DX, SEO, PWA |

Nada foi alterado em código, banco, edge functions, migrations ou regra de negócio nesta rodada.
Me diga quais itens você quer que eu execute e em qual ordem — começo pelos P0 assim que você confirmar.
