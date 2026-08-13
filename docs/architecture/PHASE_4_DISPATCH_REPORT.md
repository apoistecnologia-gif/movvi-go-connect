# APOIS CORRIDAS — FASE 4 / DISPATCH

> Status: **concluída no escopo canônico da Fase 4**. Nenhuma DDL ou Edge Function desta fase foi implantada no Supabase de produção. Validação foi feita em PostgreSQL 16 efêmero + GitHub Actions.

## Dispatch Engine única

Criada em:

`supabase/functions/_shared/dispatch-engine.ts`

A função canônica `findEligibleDriversForRide()` atende primeira oferta e redispatch. Critérios implementados/testados:

- Motorista online;
- aprovação `aprovado`;
- assinatura/gating `active|ativa|teste`;
- categoria compatível;
- GPS presente e recente;
- Motorista já indo a outro embarque ou aguardando passageiro não recebe nova oferta;
- Motorista em corrida `em_viagem` pode receber próxima corrida somente se o novo passageiro estiver próximo do destino da corrida atual;
- Motorista que já possui próxima corrida reservada não recebe outra;
- Motoristas rejeitados não são reofertados;
- Motoristas de oferta vencida não são reofertados na mesma rodada de redispatch;
- busca por raios progressivos;
- limite de ofertas por lote;
- `offered_driver_ids` representa oferta real/autorização;
- `candidate_driver_ids` representa o pool remanescente para redispatch.

Isso elimina a divergência histórica em que `candidate_driver_ids` e `offered_driver_ids` eram tratados como sinônimos.

## Endpoint canônico de dispatch

Criado:

`supabase/functions/dispatch-ride/index.ts`

Características:

- endpoint interno autenticado por service role;
- suporta `initial` e `redispatch` utilizando a mesma engine;
- não altera corrida já atribuída;
- controla expiração da oferta;
- controla expiração total de busca;
- timeout total resulta em `expired` + `cancelled_by=system`;
- nunca converte ausência de Motorista em `cancelada_passageiro`;
- persiste apenas o lote realmente ofertado em `offered_driver_ids`;
- mantém restantes em `candidate_driver_ids`;
- envia push pelo `send-ride-push`.

## Redispatch

Criado:

`supabase/functions/process-ride-dispatch/index.ts`

Este processo **não possui regra própria de elegibilidade**. Ele apenas identifica corridas vencidas e delega a decisão ao `dispatch-ride` em modo `redispatch`.

Assim, primeira oferta e redistribuição possuem uma única política.

## Aceite atômico

Baseline da Fase 4:

`supabase/baseline/006_dispatch_atomic_accept.sql`

O RPC `driver_accept_ride` é endurecido para validar, na mesma transação:

- autenticação;
- identidade `public.users` -> `public.drivers`;
- lock `FOR UPDATE` do Motorista;
- aprovação;
- assinatura/gating;
- online;
- GPS com no máximo 120 s;
- lock `FOR UPDATE` da corrida;
- status correto;
- corrida não atribuída;
- existência de **oferta real em `offered_driver_ids`**;
- Motorista não rejeitado;
- oferta não expirada;
- categoria compatível;
- corrida incompatível ativa;
- regra de próxima corrida, quando aplicável.

Ao vencer:

- atribui `driver_id` e `accepted_driver_id` como `public.drivers.id`;
- registra timestamp/status ou fila de próxima corrida;
- limpa todas as ofertas/candidatos concorrentes;
- grava snapshot do Motorista;
- gera PIN quando corrida imediata;
- registra `audit_logs` server-side na mesma operação.

`driver_reject_ride` também passa a exigir oferta real e registra auditoria server-side.

## Teste obrigatório de concorrência

Arquivo:

`tests/database/dispatch_concurrency.sh`

O teste cria uma corrida ofertada simultaneamente a dois Motoristas e dispara duas transações concorrentes chamando `driver_accept_ride`.

Critérios:

- exatamente um Motorista vence;
- a corrida termina com um único `driver_id`;
- `accepted_driver_id=driver_id`;
- exatamente um audit log de aceite;
- ofertas concorrentes são invalidadas.

Resultado final: **PASS**.

## Quality Gate executado

Workflow:

`APOIS Corridas — Dispatch validation`

Run final da fase: `31270323538`

Resultado: **SUCCESS**.

Etapas aprovadas:

- instalação;
- Dispatch typecheck;
- semantic lint;
- 6 unit tests da Dispatch Engine;
- `deno check` de `dispatch-ride`;
- `deno check` de `process-ride-dispatch`;
- baseline fresh database 000..006;
- teste concorrente de aceite;
- invariantes SQL de oferta/categoria/GPS;
- build da aplicação;
- invariantes finais de dispatch.

## Testes unitários de dispatch

6/6 aprovados:

1. filtros online/aprovação/assinatura/categoria/GPS;
2. Motorista ocupado a caminho de outro embarque excluído;
3. próxima corrida apenas perto do destino atual;
4. Motorista com próxima corrida já reservada excluído;
5. separação de ofertas atuais e candidatos remanescentes;
6. redispatch restrito ao pool remanescente, sem reoferta indevida.

## Compatibilidade e implantação

As novas Edge Functions e o RPC endurecido estão versionados/testados no branch de consolidação, porém **não foram implantados no Supabase oficial** durante esta fase.

Antes de produção haverá migration/deploy incremental revisado e compatibilidade confirmada com Passageiro/Motorista. O antigo `process-ride-dispatch` divergente existente no repositório do Passageiro será retirado da fonte de deploy do branch de consolidação para impedir que volte a ser promovido por engano.

## Escopo protegido

- `franciel046631/apois-entregas` não foi alterado;
- nenhum PR de homologação foi mesclado;
- produção não recebeu migration destrutiva;
- nenhuma credencial foi inventada.

## Próxima fase

FASE 5 — FINANCEIRO:

- mapear Mercado Pago x Asaas e finalidade real;
- criar Payment Provider abstraction quando necessário;
- modelar Ride Settlement canônico em centavos;
- Driver Ledger;
- Platform Ledger/receita APOIS;
- wallet available/pending;
- payout idempotente;
- separar dinheiro de pagamento eletrônico;
- receipt deve derivar do settlement real.
