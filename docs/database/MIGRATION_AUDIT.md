# APOIS CORRIDAS — MIGRATION AUDIT

> Auditoria iniciada em 2026-08-08 sobre `franciel046631/movvi-go-connect`, branch `feat/apois-motorista-producao-homologacao`, comparando migrations locais com o schema vivo do Supabase oficial `vqtucstyduxrqjgyigfk`.
>
> **Nenhuma migration foi executada no banco durante esta auditoria. Todas as consultas ao Supabase foram somente leitura.**

## Regra absoluta

Este repositório pertence ao APOIS CORRIDAS. `franciel046631/apois-entregas` está fora do escopo e não deve ser alterado nem usado como fonte de schema.

É proibido executar automaticamente contra produção:

- `supabase db reset`;
- `supabase db push`;
- `supabase migration repair`;
- `DROP DATABASE`;
- `DROP SCHEMA`;
- `DROP TABLE`;
- `TRUNCATE`;
- `DELETE` massivo;
- qualquer migration local cuja compatibilidade com o schema vivo não tenha sido validada.

## Classificações

- **SAFE** — compatível e reproduzível após validação em banco vazio; não significa autorização automática para produção.
- **NEEDS_REVIEW** — efeito, ordem, dependências ou paridade com produção ainda precisam ser comprovados.
- **DESTRUCTIVE** — contém ação destrutiva/perda de dados ou exige procedimento especial.
- **OBSOLETE** — não deve mais participar da cadeia canônica.
- **SUPERSEDED** — foi substituída por implementação posterior e não deve ser reaplicada isoladamente.

## Estado da cadeia local

O diretório `supabase/migrations` contém uma cadeia extensa desde 2026-06-26/2026-07-08, majoritariamente com nomes opacos/UUID, além de migrations nomeadas posteriores.

Nesta branch atual não foram encontrados arquivos com nomes `kill_trigger`, `kill_all_triggers`, `kill_all_constraints`, `kill_everything` ou `clean_baseline`. Isso **não prova que nunca existiram historicamente**; apenas registra que não aparecem na árvore atual auditada.

As migrations antigas/opaques de 2026-06-26 a 2026-07-08 ficam inicialmente classificadas como **NEEDS_REVIEW**. Não devem ser aplicadas em bloco ao Supabase oficial até que conteúdo, dependências e correspondência com o schema vivo sejam comparados.

## Divergência do histórico de migrations

A tabela `supabase_migrations.schema_migrations` do projeto oficial contém uma sequência de migrations registradas até 2026-08-06, incluindo nomes como:

- `fix_identity_and_accepted_driver_semantics`;
- `request_ride_contract_v2`;
- `enforce_ride_transition_capabilities`;
- `security_critical_fixes`;
- `ride_lifecycle_and_fk_hardening`;
- `finalize_canonical_schema_alignment`;
- `production_safety_policies`;
- `driver_presence_rpc_and_secure_document_access`.

As migrations locais nomeadas em `20260807...` não aparecem com esses números/nomes no histórico registrado, embora vários de seus efeitos estejam presentes no schema vivo.

**Conclusão:** existe histórico aplicado/manual/equivalente que não pode ser reconstruído confiando apenas no diretório local. É proibido usar `migration repair` para mascarar essa divergência sem reconstrução documentada da baseline.

## Auditoria das migrations nomeadas de 2026-08-07

| Migration | Classificação | Estado no schema vivo | Decisão |
|---|---|---|---|
| `20260807140500_apois_driver_production_contract.sql` | **SUPERSEDED** | Parte das funções/policies existe, porém versões posteriores corrigiram semântica de identidade | Não reaplicar. A versão inicial mistura USER ID e DRIVER ID em pontos críticos, inclusive no aceite/RLS. Usar apenas como referência histórica. |
| `20260807190000_apois_driver_real_signup_and_admin_approval.sql` | **NEEDS_REVIEW** | Contratos de cadastro/aprovação equivalentes existem | Comparar função por função com o banco vivo antes de incorporar à futura baseline. |
| `20260807201500_apois_driver_vehicle_photo_registration_v2.sql` | **NEEDS_REVIEW** | `driver_complete_registration_v2` existe no banco vivo | Preservar conceito de reanálise de documentos; revisar validação real de CPF, uploads, storage e idempotência antes da baseline. |
| `20260807204500_fix_driver_ride_identity_and_rating.sql` | **NEEDS_REVIEW / SUPERSEDES PARTE DE 140500** | Semântica atual de `rides.driver_id`/`accepted_driver_id` como `drivers.id` está presente | Manter a decisão de identidade; não executar isoladamente sem comparar todas as funções/policies que substitui. |
| `20260807210000_sync_driver_presence_to_active_rides.sql` | **NEEDS_REVIEW / PRESENTE** | Trigger `trg_sync_driver_presence_to_active_rides` existe em `drivers` | Lógica presente. Deve ser consolidada com o modelo definitivo de tracking/background location. |
| `20260807211000_fix_driver_relevant_ride_rls_identity.sql` | **NEEDS_REVIEW / PRESENTE** | Policy `rides_driver_read_relevant` atual usa USER IDs para ofertas e DRIVER ID para corrida atribuída | Semântica correta para o modelo de identidade atual. Incorporar à baseline canônica, não reaplicar cegamente. |
| `20260807212500_allow_passenger_active_ride_driver_photo.sql` | **NEEDS_REVIEW / PRESENTE** | Policy de leitura limitada do motorista para passageiro em corrida ativa existe | Revisar exposição mínima de dados e substituir acesso à tabela privada por superfície pública/RPC quando necessário. |
| `20260807214500_apois_passenger_rating_average.sql` | **NEEDS_REVIEW** | Rating precisa ser validado de ponta a ponta contra média real | Não declarar pronto apenas pela existência de função/coluna. |
| `20260807215000_apois_driver_next_ride_queue.sql` | **NEEDS_REVIEW** | Regras de próxima corrida precisam ser reconciliadas com Dispatch Engine única | Não promover antes da política canônica `findEligibleDriversForRide()`/equivalente. |
| `20260807220500_apois_driver_wallet_core.sql` | **NEEDS_REVIEW / PRESENTE** | Tabelas `driver_wallets`, `driver_wallet_transactions`, `driver_withdrawals` e respectivas policies existem | Não promover como ledger final antes de consolidar `RideSettlement`, idempotência e origem real dos créditos. |
| `20260807222000_apois_notifications_delete_own.sql` | **NEEDS_REVIEW / PRESENTE** | Policy `notifications_delete_own` existe e usa `mobility_user_id()` | Compatível com modelo de identidade; incorporar somente após auditoria do Notification Engine inteiro. |
| `20260807223000_apois_driver_safety_core.sql` | **NEEDS_REVIEW / PRESENTE** | `driver_emergency_contacts` e `sos_alerts` existem com RLS própria | Validar fluxo real no app/Admin; botão Segurança/SOS não pode ser placebo. |
| `20260807224900_apois_next_ride_use_current_destination_distance.sql` | **NEEDS_REVIEW** | Depende da estratégia final de dispatch/next ride | Não promover antes de unificar elegibilidade, distância e redispatch. |

## Evidências do schema vivo

Auditoria somente leitura confirmou:

### Identidade

- `public.users.auth_user_id → auth.users.id`;
- `public.drivers.user_id → public.users.id`;
- `rides.passenger_id → public.users.id`;
- `rides.driver_id → public.drivers.id`;
- `rides.accepted_driver_id → public.drivers.id`;
- ofertas/candidatos atuais operam com `public.users.id`.

Há usuário vivo com `public.users.id != public.users.auth_user_id`, portanto migrations que assumam igualdade entre essas identidades são incompatíveis.

### `rides` vivo

A inspeção atual do `information_schema.columns` confirma que o schema oficial já utiliza a geração mais nova para os pares antes considerados divergentes:

- localização operacional: `driver_latitude` / `driver_longitude` / `driver_heading`;
- polyline: `encoded_polyline`;
- cancelamento: `cancellation_reason` / `cancelled_by` / `cancelled_at`;
- PIN: `security_code`.

Não existem atualmente em `public.rides` as colunas antigas `driver_lat`, `driver_lng`, `route_polyline`, `cancel_reason` ou `safety_code`.

O bloqueio de baseline, portanto, **não é duplicidade dessas colunas no banco vivo**; é a necessidade de eliminar contratos locais/types/runtime ainda presos às gerações antigas e provar que todos os componentes usam o schema oficial atual.

### `tariff_rules` vivo

A tabela oficial atual usa a geração estruturada por categoria:

- `category_id`;
- `city`;
- `base_fare`;
- `min_fare`;
- `per_km`;
- `per_min`;
- `stop_fee`;
- `fixed_fee`;
- `dynamic_multiplier`;
- taxas específicas de serviços (`helper1_fee`, `helper2_fee`, `heavy_furniture_fee`, `assembly_fee`, `packing_fee`, `difficult_access_fee`, `stair_fee`, `heavy_vehicle_fee`, `accident_fee`, `platform_fee`, `locked_wheels_fee`, `garage_fee`, `max_weight_kg`, `per_kg`).

Não existem no `tariff_rules` vivo as colunas legadas `category_key`, `field_key` ou `value`.

**Decisão:** a família `base_fare/min_fare/per_km/...` é a candidata canônica para a Fare Engine. Código/types que ainda descrevam `field_key/value` são legados e precisam ser migrados; o banco não deve voltar à geração antiga.

### Presença/dispatch

Triggers atualmente presentes incluem:

- `trg_sync_driver_presence_to_active_rides` em `drivers`;
- `rides_append_nearby_busy_candidates` em `rides`.

O RPC `driver_set_presence` atual grava localização/estado diretamente em `drivers`, e o trigger sincroniza a posição para a corrida ativa.

### Financeiro motorista

Existem no schema vivo:

- `driver_wallets`;
- `driver_wallet_transactions`;
- `driver_withdrawals`;
- trigger `cancellation_fee_credit_driver_wallet` em `cancellation_fees`.

A existência dessas estruturas **não as torna automaticamente o ledger canônico**. O Prompt Mestre exige um settlement server-side explícito e ledger idempotente. Essa validação ainda está pendente.

### Segurança

Existem:

- `driver_emergency_contacts`;
- `sos_alerts`;
- policies próprias de leitura/inserção conforme o usuário autenticado.

Ainda é necessário comprovar UI + backend + persistência + Admin + erro/loading + testes.

### Storage

Buckets verificados:

- privados: `driver-cnh`, `driver-selfies`, `vehicle-documents`, `profile-photos`, `documents`;
- público: `public-media`.

Os buckets sensíveis do motorista são privados e as policies atuais limitam os caminhos do próprio usuário por prefixo `auth.uid()`, com leitura administrativa baseada em permissão. Existe policy específica para permitir ao Passageiro visualizar somente a foto de perfil do motorista relacionado à própria corrida em estados autorizados.

A configuração atende a direção `DENY BY DEFAULT`, mas ainda precisa de testes de autorização negativos antes de ser considerada homologada.

### Notificações

Existe `notifications_delete_own`, além das policies de leitura/atualização próprias. O Notification Engine ainda precisa ser centralizado e auditado para foreground/background/push nativo.

## Migrations antigas/opaques

Todas as migrations locais anteriores às correções nomeadas recentes permanecem **NEEDS_REVIEW** por padrão até inspeção individual ou reconstrução por comparação de schema.

Motivos:

1. há múltiplos projetos Supabase históricos no código;
2. o schema vivo já contém correções que não correspondem 1:1 ao histórico local;
3. reaplicar migrations antigas pode reintroduzir contratos de identidade/tarifa/corrida superados;
4. o objetivo é uma baseline nova e reproduzível, não reproduzir cegamente toda a história.

## Problemas que ainda impedem uma baseline imediata

- types do Passageiro e Motorista divergem apesar de ambos apontarem para o mesmo Supabase oficial;
- partes do código legado ainda podem referenciar contratos antigos que já não existem no banco vivo;
- não existe ainda uma state machine única documentada e aplicada server-side;
- não existe ainda uma Fare Engine única comprovadamente usada por estimate, request, settlement e Admin;
- settlement/ledger de corrida ainda não foi consolidado;
- histórico local de migrations não corresponde 1:1 ao histórico registrado no projeto oficial;
- ainda falta um ambiente separado validado para testar uma fresh install da baseline.

## Critério para a futura baseline

A baseline canônica só poderá ser marcada como SAFE após passar em um banco vazio:

```text
fresh database
→ migrations
→ seed
→ RLS
→ functions
→ storage
→ application
→ unit/integration/security tests
```

E deverá refletir, no mínimo:

- `IDENTITY_MODEL.md`;
- Ride entity e state machine canônicas;
- RideRequest tipado;
- Fare Engine única;
- Dispatch Engine única;
- aceite atômico;
- settlement + ledger;
- RLS deny-by-default;
- storage privado;
- KYC;
- push/location mobile;
- audit logs.

## Próximas ações

1. localizar runtime/types que ainda referenciem os contratos antigos já ausentes do banco;
2. mapear pricing/request/finalização/Admin contra o `tariff_rules` vivo;
3. definir Ride entity + state machine oficiais;
4. definir Fare Engine única antes de qualquer alteração estrutural;
5. definir settlement/ledger antes de promover wallet como definitivo;
6. somente então desenhar uma baseline nova, sem executar nada destrutivo no Supabase oficial.

## Estado desta auditoria

**Nenhuma migration foi executada, reparada, revertida ou marcada manualmente.**

O projeto oficial `vqtucstyduxrqjgyigfk` foi consultado somente para leitura e comparação estrutural.
