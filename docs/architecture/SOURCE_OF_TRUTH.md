# APOIS CORRIDAS — SOURCE OF TRUTH

> Status: inventário inicial validado em 2026-08-08. Este documento antecede alterações estruturais de banco. Nenhuma migration remota foi executada durante esta fase.

## Escopo absoluto

Este documento pertence ao **APOIS CORRIDAS**.

**Fora do escopo e proibido de alterar:** `franciel046631/apois-entregas` e qualquer schema, migration, Edge Function ou código do APOIS ENTREGAS.

## Passageiro

- **Repositório canônico candidato:** `franciel046631/say-hello-buddy-23-84b5dcbf`
- **Branch de homologação:** `feat/apois-passageiro-completo`
- **PR:** #7 — DRAFT; não mesclar antes do E2E físico Passageiro ↔ Motorista.
- **Stack verificada:** React 19, Vite 8, TanStack Router/Start, TypeScript, Capacitor 8, Supabase JS, Google Maps/Geolocation nativos.
- **Supabase configurado no branch:** `vqtucstyduxrqjgyigfk` tanto em `.env` quanto em `supabase/config.toml`.
- **Decisão:** manter como fonte principal do Passageiro durante a consolidação. Não substituir pelo repositório antigo `say-hello-buddy-23`.

### Divergência P0 do Passageiro

O arquivo `src/integrations/supabase/types.ts` do branch de homologação descreve um contrato muito menor/diferente daquele encontrado no Motorista, apesar de ambos apontarem para o mesmo project ref oficial. Exemplos:

- `rides` no Passageiro possui `destination/origin`, `intermediates`, `driver_arrived_at`, `driver_latitude`, `driver_longitude`, `encoded_polyline`, `cancellation_reason`, `security_code`;
- `rides` no Motorista possui `candidate_driver_ids`, `offered_driver_ids`, `current_offer_driver_id`, `driver_lat`, `driver_lng`, `route_polyline`, `cancel_reason`, `safety_code` e outros campos ausentes nos types do Passageiro;
- `tariff_rules` no Passageiro usa colunas `base_fare/min_fare/per_km/per_min/stop_fee/fixed_fee/dynamic_multiplier`;
- `tariff_rules` no Motorista usa `category_key/field_key/value`.

**Conclusão:** os types não podem ser tratados como fonte canônica antes de comparar com o schema vivo oficial e regenerá-los. Nenhuma cadeia local de migrations deve ser aplicada automaticamente para “corrigir” essa divergência.

## Motorista

- **Repositório canônico candidato:** `franciel046631/movvi-go-connect`
- **Branch de homologação:** `feat/apois-motorista-producao-homologacao`
- **PR:** #1 — DRAFT; não mesclar antes do E2E físico Passageiro ↔ Motorista.
- **HEAD auditado:** `52760cf2c2f64b097843148511b3a87e5f71cac2`
- **Stack verificada:** React 19, Vite 8, TanStack Router/Start, TypeScript, Capacitor 8, Supabase JS, Push Notifications e Geolocation.
- **APK mobile:** `.env.mobile` aponta para `vqtucstyduxrqjgyigfk`.
- **Backend TanStack usado pelo bundle mobile:** `https://movvi-go-connect.lovable.app`, por `src/lib/mobileFetchProxy.ts` e `vite.mobile.config.ts`.
- **Decisão:** manter a implementação operacional do Motorista e migrar/rebrandear somente o que for validado. Não reconstruir do zero.

### Divergência P0 do Motorista

No mesmo branch:

- `.env.mobile` aponta para o Supabase oficial `vqtucstyduxrqjgyigfk`;
- `.env` ainda aponta para o projeto legado `ekddifjpbieuainvjlbl`;
- `supabase/config.toml` ainda aponta para `ekddifjpbieuainvjlbl`.

**Risco:** um build mobile pode falar com o projeto oficial enquanto comandos/deploy Supabase executados a partir do mesmo repositório podem atingir outro projeto.

**Regra até consolidação:** não executar `supabase db push`, `supabase migration repair`, deploy de migrations ou qualquer operação destrutiva/remota a partir deste branch.

## Admin

- **Repositório atual:** `franciel046631/movvi-go-connect`
- **Branch de homologação:** `feat/apois-admin-supabase-oficial-homologacao`
- **PR:** #2 — DRAFT; não mesclar antes do E2E físico.
- **Estado verificado no PR:** autenticação administrativa, aprovação/reprovação/bloqueio de motorista, leitura de documentos privados por signed URLs e integração com o Supabase oficial foram trabalhados nesse branch.
- **Decisão:** preservar e consolidar o Admin existente. Não descartar funcionalidades úteis do legado.

## Backend

### Backend atualmente envolvido no fluxo mobile

O branch do Motorista contém Server Functions/Server Routes TanStack e o bundle mobile redireciona `/_serverFn/*` e `/api/*` para `https://movvi-go-connect.lovable.app`.

**Decisão provisória:** este runtime é a fonte de backend que precisa ser auditada contra o Supabase oficial antes de qualquer migração para backend standalone.

### Backends standalone legados

Foram identificados:

- `franciel046631/movvi-backend-standalone`
- `franciel046631/APOIS`

Os dois possuem conteúdo de backend standalone apontando para `wqbtnfbvqtkyywfcqjwa` e documentação de migração/publicação. O conteúdo auditado é substancialmente duplicado e não corresponde ao project ref oficial em homologação.

**Decisão:** classificar como **legado/candidato a migração**, não como backend canônico atual. Reaproveitar somente componentes que forem melhores, seguros e compatíveis com o schema canônico.

## Supabase

### Production / homologação oficial

- **Project ref confirmado para APOIS Corridas:** `vqtucstyduxrqjgyigfk`
- **Uso verificado:** Passageiro branch de homologação; APK do Motorista via `.env.mobile`; PRs de homologação.

### Referências legadas encontradas

| Project ref | Local encontrado | Classificação inicial |
|---|---|---|
| `vqtucstyduxrqjgyigfk` | Passageiro `.env`, Passageiro `supabase/config.toml`, Motorista `.env.mobile` | OFICIAL / HOMOLOGAÇÃO |
| `ekddifjpbieuainvjlbl` | Motorista `.env` e `supabase/config.toml` | LEGADO / NÃO EXECUTAR DEPLOY |
| `wqbtnfbvqtkyywfcqjwa` | `movvi-backend-standalone` e `APOIS` | LEGADO / BACKEND STANDALONE |
| `zjphbuvcapwyuynadgdt` | repositório antigo `say-hello-buddy-23` | LEGADO |

### Development e staging

Ainda não foi identificado no GitHub um project ref explicitamente documentado como **development** ou **staging** para o APOIS Corridas consolidado.

**Não inventar.** Até haver ambiente separado validado, nenhuma migration destrutiva deverá ser testada contra `vqtucstyduxrqjgyigfk`.

## Modelo de identidade — estado observado antes da decisão final

No contrato mais amplo presente no Motorista:

- `users.id` é a identidade de domínio do usuário;
- `users.auth_user_id` referencia conceitualmente a identidade autenticada do Supabase Auth;
- `drivers.id` é a identidade da entidade Motorista;
- `drivers.user_id` liga o motorista ao usuário de domínio;
- `rides.passenger_id` é usado como usuário de domínio;
- `rides.driver_id` e `rides.accepted_driver_id` são usados como IDs de `drivers` no fluxo de homologação;
- os arrays de candidatos/ofertas precisam ser auditados, pois historicamente houve mistura entre `users.id` e `drivers.id`.

Esta estrutura é compatível com a direção arquitetural preferida, desde que FKs, RPCs, RLS, types e queries sejam comprovadamente consistentes.

**Nenhuma mudança de identidade será aplicada antes de concluir `IDENTITY_MODEL.md` e validar o schema vivo.**

## Código legado identificado

### Migrar quando tecnicamente superior e compatível

- lógica operacional de Motorista já presente em `movvi-go-connect`;
- Server Functions/RPCs úteis do backend standalone somente após comparação;
- recursos de segurança, SOS, incidentes, carteira, payout e notificações quando existirem implementações reais e autorizadas;
- estrutura de Admin útil já existente.

### Não usar como fonte canônica

- `franciel046631/movvidriver`: protótipo AI Studio/Gemini, stack separada e sem evidência de ser o app operacional atual;
- `franciel046631/say-hello-buddy-23`: geração antiga do Passageiro, apontando para Supabase legado;
- `franciel046631/SITEMOVVI`: projeto web/protótipo separado; não é fonte do core mobile/backoffice;
- `franciel046631/APOIS` e `franciel046631/movvi-backend-standalone`: snapshots de backend standalone legados até nova decisão.

## Regras de proteção vigentes

1. PR #1 Motorista permanece DRAFT.
2. PR #7 Passageiro permanece DRAFT.
3. PR #2 Admin permanece DRAFT.
4. Nenhum merge até concluir o E2E físico e os gates técnicos correspondentes.
5. Não alterar `franciel046631/apois-entregas`.
6. Não executar migrations destrutivas contra produção.
7. Não confiar em types gerados/local migrations até validar contra o schema vivo.
8. Não confiar no frontend para preço final, pagamento, role ou autorização.
9. Não declarar feature pronta apenas porque build passou ou botão apareceu.

## Próxima fase obrigatória

1. criar `docs/architecture/IDENTITY_MODEL.md` com a representação canônica de Auth/User/Driver/Ride;
2. criar `docs/database/MIGRATION_AUDIT.md` classificando migrations locais sem executá-las;
3. comparar schema esperado pelo Passageiro, Motorista, Admin e backend com o schema vivo oficial;
4. somente então propor baseline canônica e regeneração dos Supabase types;
5. nenhuma alteração remota de banco antes dessas validações.
