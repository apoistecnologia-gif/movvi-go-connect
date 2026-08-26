# APOIS CORRIDAS — DISPATCH ENGINE

> Estado: auditoria do código do Passageiro e da Edge Function ativa no Supabase oficial `vqtucstyduxrqjgyigfk`. Nenhuma alteração remota de banco ou Edge Function foi feita nesta etapa.

## Fonte ativa observada

A Edge Function **ativa** `passenger-ride-request` (versão 8 no Supabase oficial) contém atualmente a implementação de dispatch que está efetivamente no caminho de criação da corrida.

Ela utiliza a mesma função local `dispatch()` tanto para:

- primeira distribuição imediatamente após criar a corrida;
- redistribuição acionada por `action = "redispatch"`.

Isso já atende parcialmente ao requisito de não manter uma regra para o primeiro dispatch e outra para redispatch dentro desse fluxo.

## Elegibilidade atual da função ativa

A implementação ativa considera:

- motorista `is_online = true`;
- `approval_status = aprovado`;
- categoria compatível;
- assinatura em estado aceito (`ativa`, `teste`, `active`);
- localização recente quando `last_location_at` existe, com limite de 120 s;
- motorista rejeitado anteriormente é excluído;
- motorista indo ao embarque ou já no embarque é excluído;
- motorista em viagem pode receber uma próxima corrida somente se a origem da nova corrida estiver próxima do destino da corrida atual e não houver outra já enfileirada;
- motorista livre é ordenado pela distância até a origem;
- raios progressivos de 3, 5, 8, 12, 20, 30 e 50 km;
- no máximo 20 candidatos por rodada.

Os identificadores gravados em `candidate_driver_ids`/`offered_driver_ids` são `public.users.id` do motorista, coerentes com `IDENTITY_MODEL.md`.

## Timeout atual

Na função ativa:

- busca total: 180 s;
- oferta/rodada: 60 s;
- quando a busca expira, o status é `expired`;
- a razão é registrada como "Nenhum motorista disponível no momento.";
- `cancelled_by = system`.

Esse comportamento é coerente com a regra arquitetural de **não transformar falta de motorista em cancelamento pelo passageiro**.

## Implementação paralela divergente encontrada

Existe no repositório Passageiro:

`supabase/functions/process-ride-dispatch/index.ts`

Ela implementa outra política de redistribuição e diverge da função ativa em pontos importantes:

1. usa timeout de oferta de 20 s, enquanto `passenger-ride-request` usa 60 s;
2. não aplica a mesma validação de assinatura;
3. possui uma checagem de ocupação construída com IDs de domínios diferentes (`drivers.user_id` versus `rides.driver_id`, que é `drivers.id`);
4. não aplica a mesma política de próxima corrida;
5. exclui motoristas previamente ofertados de forma diferente;
6. ao esgotar a busca, grava `status = cancelada_passageiro`, o que viola a regra de não atribuir ao passageiro a indisponibilidade de motorista.

## Situação no ambiente oficial

Na listagem de Edge Functions ativas do Supabase oficial, `process-ride-dispatch` **não está implantada**.

Portanto:

- ela não é fonte de verdade operacional hoje;
- não deve ser implantada no estado atual;
- deve ser marcada como **SUPERSEDED/NEEDS_MIGRATION** até que passe a reutilizar exatamente a Dispatch Engine canônica.

## Decisão canônica

A política de elegibilidade atualmente contida em `passenger-ride-request` é a melhor candidata para a Dispatch Engine oficial.

Ela deve ser extraída para um módulo server-side compartilhado, conceitualmente:

```ts
findEligibleDriversForRide(ride, context)
```

ou equivalente.

Depois, todas as entradas devem usar esse mesmo módulo:

```text
request inicial
redispatch por timeout
ativação de agendada
próxima corrida durante viagem
rotina/cron de recuperação
```

Nenhum desses caminhos deve possuir filtros próprios divergentes.

## Aceite

O dispatch entrega USER IDs de domínio nas listas de oferta.

O RPC vivo `driver_accept_ride()`:

1. resolve `auth.uid()` → `public.users.id`;
2. resolve `public.drivers.id`;
3. bloqueia motorista e corrida com `FOR UPDATE`;
4. valida aprovação, online/status, assinatura e presença na oferta;
5. atribui a corrida usando `public.drivers.id`;
6. altera o estado da corrida.

Essa é a base correta para aceite atômico, mas o requisito de concorrência ainda permanece pendente:

```text
2 motoristas aceitam a mesma corrida simultaneamente
→ exatamente 1 vence
→ o outro recebe conflito/indisponibilidade
```

Somente teste real de concorrência poderá fechar esse item.

## Lacunas restantes

- extrair o algoritmo para `_shared/dispatch.ts` ou módulo equivalente;
- migrar `process-ride-dispatch` para reutilizar o módulo, ou removê-la se o mecanismo automático for substituído;
- definir explicitamente o mecanismo server-side que dispara redispatch sem depender exclusivamente do Passageiro manter o app aberto;
- testar recuperação de corrida após perda de rede;
- testar GPS vencido;
- testar assinatura expirada;
- testar motorista ocupado;
- testar próxima corrida;
- testar dois motoristas aceitando simultaneamente;
- centralizar push de oferta no Notification Engine.

## Regra de segurança

Não implantar `process-ride-dispatch` atual em produção. Ela possui divergências de identidade, elegibilidade e status terminal em relação ao caminho ativo e ao Prompt Mestre.
