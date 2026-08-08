# APOIS CORRIDAS — FASE 3 / CORE RIDE

> Status: **concluída no escopo canônico da Fase 3**. Esta fase não fez deploy de Edge Function nem alteração DDL em produção. Integração de dispatch/redispatch fica deliberadamente para a Fase 4.

## Objetivos do Prompt Mestre atendidos

- entidade/contrato canônico de solicitação;
- state machine canônica;
- suporte explícito a intermediates, máximo 3;
- Fare Engine única e explicável;
- preço calculado server-side, sem aceitar preço final do cliente;
- testes unitários do core;
- typecheck/lint/Deno check/build de fase.

## Módulos canônicos

### `supabase/functions/_shared/ride-request.ts`

Contrato `CanonicalRideRequest`:

- `request_key` UUID;
- categoria normalizada para `carros|motos|fretes|guincho|envios`;
- `origin`;
- `destination`;
- `intermediates[]` com máximo 3;
- `payment_method` obrigatório;
- `service_details` limitado;
- `pickup_notes`;
- `scheduled_for`;
- `coupon_code`.

Não existe default silencioso de forma de pagamento. Coordenadas e request key são validados.

### `supabase/functions/_shared/ride-state.ts`

Preserva os nomes de status persistidos no banco vivo para evitar migration cosmética de alto risco:

```text
agendada
procurar_motorista
motorista_a_caminho
motorista_chegou
em_viagem
finalizada
cancelada_passageiro
cancelada_motorista
expired
```

Regras cobertas:

- motorista só aceita com oferta válida;
- início exige PIN verificado;
- estados terminais não transitam;
- timeout sem motorista é `expired`, nunca cancelamento do passageiro;
- cancelamento pelo Passageiro não é aceito após `motorista_chegou`.

### `supabase/functions/_shared/fare-engine.ts`

`calculateServerFare()` gera `FareBreakdown` com:

- base fare;
- fixed fee;
- distance fare;
- time fare;
- minimum adjustment;
- stops fare;
- extras;
- dynamic multiplier/adjustment;
- discount;
- subtotal;
- total;
- `totalCents`.

A agregação monetária é feita em centavos inteiros antes do total. O retorno decimal existe por compatibilidade de clientes atuais.

Serviços especiais cobertos no core:

- Fretes: ajudantes, item pesado, montagem/desmontagem, embalagem, acesso, escadas;
- Guincho: veículo pesado, acesso, acidente, plataforma, rodas travadas, garagem/subsolo;
- Envios: peso e limite máximo.

`supabase/functions/_shared/pricing.ts` virou apenas entrypoint de compatibilidade para a Fare Engine canônica; nova lógica de preço não deve ser duplicada ali.

## Testes executados

Workflow: **APOIS Corridas — Core Ride validation**

Run: `31269584955`

Resultado: **SUCCESS**.

Etapas:

- instalação de dependências: PASS;
- `npx tsc -p tsconfig.core.json --noEmit`: PASS;
- ESLint semântico do core: PASS;
- Deno unit tests: PASS;
- Deno check dos módulos compartilhados: PASS;
- build da aplicação: PASS;
- invariantes do core: PASS.

Suite unitária: **16 passed / 0 failed**.

Cobertura funcional dos testes:

- minimum fare;
- rota completa + paradas + multiplicador;
- extras de Fretes;
- limite de peso de Envios;
- desconto e centavos;
- lifecycle válido;
- aceite sem oferta rejeitado;
- início sem PIN rejeitado;
- `expired` distinto de cancelamento pelo passageiro;
- cancelamento após chegada bloqueado;
- terminal sem nova transição;
- normalização de RideRequest;
- máximo de 3 intermediates;
- payment obrigatório;
- coordenada inválida;
- `service_details` superdimensionado.

## Achado de auditoria durante typecheck

Ao substituir o comando antigo `bunx tsgo` por `tsc --noEmit`, o typecheck global revelou grande quantidade de contratos legados divergentes do schema vivo. Eles foram registrados em:

`docs/architecture/SCHEMA_RUNTIME_DRIFT.md`

Isso não foi escondido com `any` nem resolvido recriando tabelas antigas. Os consumidores serão corrigidos em suas fases próprias:

- Passageiro: Fase 6;
- Motorista: Fase 7;
- Admin: Fase 8;
- limpeza global final: Fase 12.

A Fase 3 usa `tsconfig.core.json` somente para garantir o core criado nesta fase; isso não substitui os gates completos futuros.

## Integração Edge deliberadamente encaminhada à Fase 4

Foi tentado source-sync de `passenger-ride-request` para o repositório canônico e o `deno check` mostrou incompatibilidades de tipagem entre query dinâmica do cliente Supabase e o código importado. O arquivo WIP foi removido em vez de permanecer quebrado.

A função viva continua operando em produção. Na Fase 4, `passenger-ride-request` e `process-ride-dispatch` serão trazidos para o GitHub canônico junto com uma Dispatch Engine compartilhada, e ambos só serão promovidos quando passarem `deno check` e testes.

## Segurança operacional

- nenhum `supabase db reset` em produção;
- nenhum `db push` em produção;
- nenhuma migration destrutiva;
- nenhum deploy da função WIP;
- `franciel046631/apois-entregas` não foi alterado.

## Próxima fase

FASE 4 — Dispatch:

1. extrair uma única política `findEligibleDriversForRide`;
2. usar a mesma regra em dispatch inicial e redispatch;
3. separar `candidate_driver_ids` de `offered_driver_ids`;
4. timeout -> `expired`;
5. endurecer aceite atômico para oferta real + GPS recente + categoria;
6. validar fila de próxima corrida;
7. teste concorrente com dois motoristas aceitando a mesma corrida;
8. Deno check das funções de dispatch antes de qualquer deploy.
