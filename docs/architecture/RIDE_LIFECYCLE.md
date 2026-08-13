# APOIS CORRIDAS — RIDE LIFECYCLE

> Estado: definição canônica derivada do schema vivo e dos RPCs ativos do Supabase oficial `vqtucstyduxrqjgyigfk`. Nenhuma alteração de banco foi executada nesta etapa.

## Princípio

O backend é a autoridade do estado da corrida. A interface pode refletir/antecipar visualmente uma transição, mas não pode decidir sozinha qual estado é válido.

## Estados vivos atuais

O constraint de `public.rides.status` aceita atualmente:

- `agendada`;
- `procurar_motorista`;
- `motorista_a_caminho`;
- `motorista_chegou`;
- `em_viagem`;
- `finalizada`;
- `cancelada_passageiro`;
- `cancelada_motorista`;
- `expired`.

## State machine canônica v1

A consolidação deve preservar os nomes vivos acima para não criar uma migração cosmética de alto risco.

Fluxo principal:

```text
agendada
   │ ativação
   ▼
procurar_motorista
   │ aceite atômico
   ▼
motorista_a_caminho
   │ driver_mark_arrived
   ▼
motorista_chegou
   │ PIN válido / driver_start_ride
   ▼
em_viagem
   │ driver_finish_ride
   ▼
finalizada
```

Uma corrida imediata nasce diretamente em `procurar_motorista`.

## Significado dos estados

### `agendada`

Corrida persistida para execução futura. Ainda não deve ser tratada como oferta ativa até o mecanismo oficial de ativação.

### `procurar_motorista`

Estado de busca/oferta. A implementação atual mantém candidato/oferta/timeout como metadados dentro deste estado, em vez de criar estados separados `driver_offered`.

Essa simplificação é aceitável desde que:

- o backend controle validade da oferta;
- `candidate_driver_ids`, `offered_driver_ids`, `rejected_driver_ids`, `request_expires_at` e `search_expires_at` sejam consistentes;
- somente um motorista consiga aceitar.

### `motorista_a_caminho`

Motorista aceitou e está se deslocando até o embarque.

Entrada atual: `driver_accept_ride()`.

### `motorista_chegou`

Motorista confirmou chegada ao embarque e aguarda o PIN.

Entrada atual: `driver_mark_arrived()` somente a partir de `motorista_a_caminho`.

Este estado representa conceitualmente a fase `waiting_pin` do Prompt Mestre; não é necessário criar outro status apenas para renomear a mesma etapa.

### `em_viagem`

PIN foi validado e a viagem começou.

Entrada atual: `driver_start_ride()` somente a partir de `motorista_chegou` e com `security_code` correspondente.

### `finalizada`

Corrida concluída pelo motorista.

Entrada atual: `driver_finish_ride()` somente a partir de `em_viagem`.

A transição de status existe, mas a finalização financeira ainda não é canônica: o RPC atual apenas preenche `final_price` com `estimated_price` quando necessário. Settlement/ledger ainda precisam ser integrados.

## Estados terminais

### `cancelada_passageiro`

Cancelamento solicitado pelo Passageiro dentro das regras permitidas.

A Edge Function ativa `cancel-ride` atualmente permite cancelamento em:

- `agendada`;
- `procurar_motorista`;
- `motorista_a_caminho`.

E bloqueia após:

- `motorista_chegou`;
- `em_viagem`.

Também calcula a multa quando aplicável e bloqueia a carteira do Passageiro enquanto houver dívida.

### `cancelada_motorista`

Cancelamento pelo Motorista.

O RPC atual `driver_cancel_ride()` permite somente em:

- `motorista_a_caminho`;
- `motorista_chegou`.

### `expired`

Busca expirou/nenhum motorista ficou disponível no prazo.

Este é o estado correto para indisponibilidade/timeout no contrato atual.

**Nunca converter esse caso para `cancelada_passageiro`.**

## Cancelamento administrativo

O Prompt Mestre exige terminal separado para cancelamento por Admin. O constraint vivo ainda não possui `cancelada_admin`.

Não inventar nem aplicar esse status diretamente em produção durante a auditoria.

Decisão alvo:

- adicionar um terminal administrativo explícito ou outra representação igualmente inequívoca;
- implementar exclusivamente via operação server-side autorizada e auditada;
- atualizar constraint, Admin, relatórios, tipos e testes juntos.

Até isso existir, Admin não deve simular cancelamento do passageiro ou motorista para encerrar uma corrida.

## Transições server-side existentes

### Aceite

`driver_accept_ride()`:

```text
procurar_motorista → motorista_a_caminho
```

ou reserva uma próxima corrida ainda em `procurar_motorista` usando `queued_after_ride_id`, quando o motorista está em uma viagem compatível.

O RPC bloqueia registros com `FOR UPDATE` e valida a oferta antes de atribuir `drivers.id`.

### Chegada

`driver_mark_arrived()`:

```text
motorista_a_caminho → motorista_chegou
```

### PIN/início

`driver_start_ride()`:

```text
motorista_chegou + security_code correto → em_viagem
```

### Finalização

`driver_finish_ride()`:

```text
em_viagem → finalizada
```

Se existe uma próxima corrida previamente reservada, o RPC promove essa corrida de `procurar_motorista` para `motorista_a_caminho` após finalizar a atual.

### Recusa da oferta

`driver_reject_ride()` não troca o estado global da corrida. Ele remove o USER ID do motorista da oferta/candidatos e o registra em `rejected_driver_ids` enquanto a corrida permanece `procurar_motorista`.

## PIN — lacuna P0

O PIN de 4 dígitos é obrigatório e já bloqueia início com código incorreto.

Entretanto o RPC vivo `driver_start_ride()` não possui, na implementação auditada:

- contador de tentativas;
- rate limiting;
- lock temporário;
- audit trail específico de tentativas inválidas.

Portanto o requisito de segurança do PIN ainda está aberto.

## Rating

`driver_rate_passenger()` somente permite avaliação:

- em corrida `finalizada`;
- pelo motorista atribuído;
- uma única vez (`driver_rated_at is null`).

A média do Passageiro é recalculada no servidor.

A direção equivalente Passageiro → Motorista também precisa permanecer protegida contra avaliação duplicada/pré-conclusão.

## Lacuna estrutural — state machine fragmentada

Hoje as regras de transição estão distribuídas entre:

- `passenger-ride-request`;
- `cancel-ride`;
- RPCs `driver_*`;
- lógica de agendamento/próxima corrida;
- possíveis rotas administrativas.

Isso reduz erros em cada operação isolada, mas ainda não constitui uma state machine central única.

A implementação final deve possuir uma camada única de validação conceitual, por exemplo:

```text
canTransitionRide(from, to, actor, context)
```

ou funções/RPCs equivalentes, com todas as mutações críticas passando por ela.

## Transições que devem ser rejeitadas

Exemplos mínimos:

- iniciar sem `motorista_chegou`;
- iniciar com PIN incorreto;
- finalizar antes de `em_viagem`;
- Passageiro cancelar depois de `motorista_chegou`;
- motorista aceitar corrida já atribuída;
- motorista não ofertado aceitar;
- motorista cancelar corrida de outro motorista;
- avaliar antes de `finalizada`;
- avaliar duas vezes;
- transformar timeout de busca em cancelamento do passageiro.

## Próximos testes obrigatórios

1. cada transição válida;
2. cada transição inválida acima;
3. corrida agendada → ativação;
4. expiração sem motorista → `expired`;
5. cancelamento com e sem multa;
6. próxima corrida reservada;
7. dois motoristas aceitando simultaneamente;
8. PIN incorreto repetido após adicionar rate-limit/lock;
9. perda/reconexão de rede entre transições;
10. sincronização visual Passageiro ↔ Motorista ↔ Admin.
