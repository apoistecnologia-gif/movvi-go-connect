## Escopo e limites

Somente mudanças visuais, de layout, de organização e de microcopy. Não altero:
migrations, edge functions, webhooks, RLS, `driverAuth.functions.ts`,
`rideLifecycle.ts` (lógica), Supabase client, contratos de tipos, rotas ou
nomes de campos. Preservo componentes existentes; foco em reorganizar,
padronizar tokens de status e melhorar textos.

## Arquivos que pretendo tocar (todos UI/copy)

Passageiro
- `src/routes/index.tsx` — home: priorizar mapa + "Para onde?" + botão principal, reduzir cards decorativos.
- Componentes de resumo/estado de corrida do passageiro em `src/components/*` (bottom sheets de "procurando", "motorista a caminho", "chegou", "em viagem", "finalizada"): reforçar próxima ação, manter SOS + compartilhar visíveis.
- Copy do preço: substituir "valor estimado" / "preço estimado" por "Valor da corrida" no card e "Você paga" perto do botão de confirmar; adicionar observação discreta uma única vez.

Motorista
- `src/routes/motorista.app.tsx` — hero mais operacional: toggle Online/Offline grande, corrida atual em destaque, ganhos do dia, assinatura, alertas; remover ornamentos.
- Ajustes menores em `src/routes/motorista.assinatura.tsx` e `motorista.ganhos.tsx` apenas para padronizar badges/status e reduzir peso visual.

Admin
- `src/routes/admin.motoristas.tsx`, `admin.passageiros.tsx`, `admin.corridas.tsx`, `admin.pagamentos.tsx`, `admin.suporte.tsx`, `admin.financeiro-motoristas.tsx`: padronizar cabeçalho compacto + filtros + tabela densa, ações rápidas consistentes, remover cards ornamentais que empurram a tabela.
- `src/components/admin/AdminSidebar.tsx` — pequena limpeza visual se necessário.

Padrão de status (transversal)
- `src/design-system/Badge.tsx` e/ou `StatusPill.tsx`: garantir variantes semânticas
  - success (verde), warning (amarelo), danger (vermelho), info (azul), muted (cinza).
- Mapear textos de status atuais (pendente, ativo, aprovado, bloqueado, etc.) para a variante correta em cada tela — sem renomear os valores no banco.

Debug/dev
- `src/components/admin/AdminSidebar.tsx`, `DriverSideMenu.tsx`, `PassengerSideMenu.tsx`: esconder links para `/debug/*`, `/dev-diagnostics`, `/dev/rating-test`, `/map-test` quando `import.meta.env.PROD` (rotas permanecem, só o link visível some).

Mobile-first
- Ajustar apenas espaçamentos, alvos de toque (mín. 44px), `safe-area-inset`, evitar sobreposição de bottom sheet com botão principal.

## Fora deste plano (aviso, não faço)

- Redesenho grande de bottom sheets ou do fluxo de solicitar corrida.
- Reescrever `rideLifecycle.ts` (posso importar textos dele, mas não editar lógica).
- Ajustar `motorista.cadastro.tsx` (tocou fluxo sensível recentemente).
- Trocar biblioteca de UI, tokens globais de cor da marca, ou tipografia.

## Entrega

1. Executar as mudanças em batches por perfil.
2. Rodar `bun run lint` ao final.
3. Listar cada arquivo alterado com uma linha do que mudou.
4. Confirmar que nada de lógica/banco/auth/pagamento foi tocado.

Se algo durante a execução exigir tocar em lógica, paro e reporto em vez de mudar.
