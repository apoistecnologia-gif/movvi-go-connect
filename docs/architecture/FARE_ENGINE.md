# APOIS CORRIDAS — FARE ENGINE

> Estado: decisão arquitetural baseada no schema vivo oficial `vqtucstyduxrqjgyigfk` e no código atual do Passageiro. Nenhuma alteração remota de banco foi executada nesta etapa.

## Fonte canônica candidata

A implementação mais consistente encontrada atualmente está no repositório Passageiro `franciel046631/say-hello-buddy-23-84b5dcbf`, branch `feat/apois-passageiro-completo`:

- `supabase/functions/_shared/pricing.ts` → `calculateServerFare()`;
- `supabase/functions/passenger-pricing-estimate/index.ts` → usa `calculateServerFare()` para estimativa;
- `supabase/functions/passenger-ride-request/index.ts` → recalcula rota e usa a mesma `calculateServerFare()` ao criar a corrida.

**Decisão:** preservar `calculateServerFare()` como núcleo da Fare Engine canônica e migrá-la para uma superfície compartilhada por todos os fluxos server-side, em vez de reintroduzir fórmulas antigas.

## Schema de tarifa canônico

O `tariff_rules` vivo usa:

- `category_id → ride_categories.id`;
- `city`;
- `base_fare`;
- `min_fare`;
- `per_km`;
- `per_min`;
- `stop_fee`;
- `fixed_fee`;
- `dynamic_multiplier`;
- extras específicos de serviço;
- `is_active`, `valid_from`, `valid_to`.

A geração antiga `category_key / field_key / value` **não existe** no schema oficial e não deve voltar.

## Fórmula observada

`calculateServerFare()` executa, em ordem conceitual:

```text
fixed_fee
+ base_fare
+ per_km × distância
+ per_min × duração
↓
max(min_fare, subtotal base)
↓
+ stop_fee × quantidade de paradas
+ extras específicos do serviço
↓
× dynamic_multiplier
↓
arredondamento monetário em centavos
```

Extras atualmente implementados:

### Fretes

- 1 ajudante;
- 2 ajudantes;
- item pesado;
- montagem/desmontagem;
- embalagem;
- acesso difícil em retirada/entrega;
- escadas por andar quando não há elevador.

### Guincho

- veículo pesado;
- acesso difícil;
- veículo acidentado;
- plataforma do guincho;
- rodas travadas;
- garagem/subsolo.

### Envios

- validação de peso máximo;
- preço por kg.

## Rotas e paradas

`passenger-ride-request` envia as paradas intermediárias ao Google Routes e calcula a rota completa antes do preço oficial.

Portanto, a direção canônica é:

```text
origem + intermediates + destino
        ↓
rota oficial server-side
        ↓
distância + duração
        ↓
calculateServerFare()
        ↓
preço oficial
```

O preço enviado pelo cliente não é fonte de verdade.

## Divergência encontrada — região/cidade

`passenger-pricing-estimate` aceita `city` e seleciona tarifa da cidade com fallback para `default`.

`passenger-ride-request`, no estado auditado, carrega somente a tarifa `city = 'default'`.

Isso significa que, se tarifas específicas por cidade forem cadastradas agora, a estimativa pode escolher uma regra diferente da regra usada na criação da corrida.

**Regra até corrigir:** o Admin deve editar somente a tarifa `default`. Não habilitar criação de tarifas específicas por cidade antes de unificar a seleção de região na estimativa e no request.

## Divergência encontrada — finalização

O RPC vivo `driver_finish_ride()` não recalcula settlement com a Fare Engine. Ele finaliza usando `final_price` existente ou `estimated_price`.

Portanto hoje a Fare Engine está compartilhada por:

- estimativa;
- criação da corrida;

mas ainda **não** por:

- settlement final;
- ledger do motorista;
- recibo final;
- simulação oficial do Admin.

A feature não pode ser declarada concluída enquanto essa lacuna existir.

## Admin

A tela antiga `/admin/precos` e `adminPricing.functions.ts` ainda utilizavam o contrato inexistente `category_key / field_key / value`.

Foi preparada no PR Admin #2 uma migração cirúrgica para o contrato atual:

- UI estruturada pelos campos reais de `tariff_rules`;
- região `default` apenas enquanto a seleção regional não for unificada;
- sem campos arbitrários;
- mutação server-side por RPC autorizada;
- audit log na mesma transação.

A migration que cria esse RPC está **somente preparada no GitHub** e não deve ser aplicada à produção antes de validação em ambiente development/staging.

## Contrato alvo

A Fare Engine final deve oferecer uma única operação conceitual:

```ts
fareEngine.calculate({
  category,
  route,
  tariff,
  stopCount,
  serviceDetails,
}) -> FareBreakdown
```

`FareBreakdown` deve evoluir para explicar explicitamente:

- base;
- distância;
- tempo;
- paradas;
- taxas fixas;
- extras;
- multiplicador dinâmico;
- desconto quando aplicável;
- total.

O objeto atual (`base`, `extras`, `total`) é funcional, mas ainda não explica separadamente distância/tempo/taxas para recibo, auditoria e Admin.

## Próximas ações

1. unificar seleção de `city` entre estimate e request;
2. extrair/compartilhar a Fare Engine de modo que settlement também a use quando a regra do produto exigir recálculo final;
3. definir `RideSettlement` em centavos/integers ou outra estratégia monetária segura;
4. conectar recibo e ledger ao settlement real;
5. criar testes unitários da fórmula, extras, mínimo, multiplier e arredondamento;
6. criar teste de integração garantindo que estimate e request retornem o mesmo preço para a mesma rota/entrada.
