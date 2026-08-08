# APOIS CORRIDAS — FASE 2 / BANCO

> Escopo: consolidação de schema, identidade, baseline, RLS, Storage e types. O projeto de produção `vqtucstyduxrqjgyigfk` foi consultado somente em modo leitura nesta fase; nenhuma DDL/migration destrutiva foi executada remotamente.

## Resultado

A baseline canônica foi validada em PostgreSQL 16 vazio por GitHub Actions. O pipeline aplica, em ordem:

1. `000_ci_prelude.sql` — emulação mínima de schemas Supabase somente para CI;
2. `001_canonical_schema.sql`;
3. `002_functions.sql`;
4. `003_rls.sql`;
5. `004_storage_triggers_seed.sql`;
6. `005_security_hardening.sql`.

O prelude de CI **não** deve ser implantado em Supabase.

## Identidade canônica

Validada contra FKs/UNIQUE do schema vivo:

```text
auth.users.id
  -> public.users.auth_user_id UNIQUE
  -> public.users.id
  -> public.drivers.user_id UNIQUE
  -> public.drivers.id
```

Semântica operacional:

- `rides.passenger_id` -> `public.users.id`;
- arrays de oferta/candidatos -> `public.users.id`;
- `rides.driver_id` e `rides.accepted_driver_id` -> `public.drivers.id`;
- wallets/withdrawals do Motorista -> `public.drivers.id`.

`public.profiles.user_id` referencia diretamente `auth.users.id` e é uma superfície administrativa/CMS distinta; não deve ser confundida com `public.users` do domínio de mobilidade.

## Schema vivo auditado

Tabelas críticas verificadas:

- identidade: `users`, `user_roles`, `profiles`, `drivers`;
- corrida: `rides`, `ride_categories`, `tariff_rules`;
- financeiro atual: `payment_methods`, `payment_webhook_receipts`, `passenger_wallets`, `cancellation_fees`, `driver_wallets`, `driver_wallet_transactions`, `driver_withdrawals`;
- notificações: `user_notification_tokens`, `user_notification_preferences`, `notifications`, `notification_logs`;
- segurança: `sos_alerts`, contatos de emergência, `audit_logs`.

A Fase 5 ainda precisa adicionar o domínio financeiro canônico de corrida (`ride_settlements` e ledger/plataforma ou representação equivalente). A existência de wallets atuais não significa settlement finalizado.

## RLS

Todas as tabelas `public` auditadas no projeto vivo têm RLS habilitada.

Achado P0/P1 de autorização de oferta:

- a policy viva `rides_driver_read_relevant` usa `candidate_driver_ids` como superfície de leitura;
- no dispatch atual `candidate_driver_ids` e `offered_driver_ids` são preenchidos com o mesmo conjunto, portanto o comportamento presente não difere;
- arquiteturalmente a autorização do cliente deve depender de **oferta real**, não de bookkeeping de elegibilidade.

A baseline foi endurecida em `005_security_hardening.sql` para usar `offered_driver_ids`. Essa mudança está testada somente em banco efêmero de CI e **não foi aplicada em produção**.

Também foi validado que `payment_webhook_receipts` permanece sem acesso de cliente (`false/false`).

## Storage

Buckets vivos verificados:

- `driver-selfies` — privado, 10 MiB, imagem;
- `driver-cnh` — privado, 10 MiB, imagem/PDF;
- `vehicle-documents` — privado, 10 MiB, imagem/PDF;
- `profile-photos` — privado, 10 MiB, imagem;
- `documents` — privado;
- `public-media` — público e restrito a conteúdo público.

Policies de `storage.objects` usam convenção de caminho `<auth.uid()>/...` para documentos do Motorista. Passageiro recebe somente uma exceção mínima para foto de perfil do motorista de uma corrida relevante; documentos privados não são expostos.

## Types

Os types atuais de Motorista, Passageiro e Admin foram comparados com o contrato gerado novamente a partir de `vqtucstyduxrqjgyigfk` nesta auditoria. Os contratos críticos atuais (`rides`, `tariff_rules`, `drivers`, wallets, notifications e RPCs) estão alinhados com a geração viva.

Regra daqui em diante: qualquer alteração de schema exige regeneração dos types em todos os consumidores antes de promover a fase.

## Baseline x produção

A baseline é uma reconstrução para **fresh database**. Ela não é uma migration incremental de produção.

Não executar diretamente sobre produção:

```text
supabase db reset
supabase db push
supabase migration repair
```

nem scripts da baseline como migração ad-hoc.

Mudanças incrementais futuras precisam de migration própria, teste no banco efêmero e revisão antes de qualquer ambiente remoto.

## Quality gate executado

Workflow: `APOIS Database — canonical baseline`

Valida:

- fresh install em PostgreSQL 16;
- todas as tabelas públicas com RLS;
- buckets KYC privados;
- categorias e métodos de pagamento seedados;
- permissão administrativa mínima esperada;
- `rides.request_key` UNIQUE;
- presença do RPC de aceite atômico;
- RLS de oferta baseada em `offered_driver_ids` na baseline;
- webhook financeiro fechado para clientes;
- trigger de criação de identidade/role/wallet;
- ausência de `DROP DATABASE/SCHEMA/TABLE`, `TRUNCATE` e `DELETE FROM` destrutivos na baseline.

Run validado em 2026-08-08: **SUCCESS**.

## Pendências encaminhadas às fases seguintes

- Fase 3: centralizar RideRequest/state machine/Fare Engine e resolver `category` textual versus `category_id` de forma compatível e testada;
- Fase 4: separar definitivamente elegibilidade de oferta, fortalecer aceite para `offered_driver_ids` e executar teste concorrente;
- Fase 5: settlement/ledger/payout canônicos;
- Fase 7: CPF completo, proteção anti-abuso/upload e hardening de PIN;
- Fase 8: RBAC administrativo fino e audit log transacional.

## Escopo protegido

`franciel046631/apois-entregas` não foi alterado e não participa desta baseline.
