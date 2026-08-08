# APOIS CORRIDAS — SOURCE OF TRUTH

> Atualizado em 2026-08-08 durante a consolidação exigida pelo Prompt Mestre. O schema vivo foi auditado por consultas de leitura no Supabase oficial. Nenhuma migration destrutiva foi executada em produção.

## Escopo absoluto

Este documento pertence ao **APOIS CORRIDAS**.

**Fora do escopo e proibido de alterar:** `franciel046631/apois-entregas` e qualquer schema, migration, Edge Function, banco ou código do APOIS ENTREGAS.

## Passageiro

- **Repositório canônico:** `franciel046631/say-hello-buddy-23-84b5dcbf`
- **Branch:** `feat/apois-passageiro-completo`
- **PR:** #7 — DRAFT; não mesclar antes do E2E físico Passageiro ↔ Motorista.
- **Stack:** React 19, Vite, TanStack Router/Start, TypeScript, Capacitor, Supabase JS, Google Maps/Geolocation.
- **Supabase:** `vqtucstyduxrqjgyigfk` em `supabase/config.toml` e no runtime de homologação.
- **Decisão:** manter como fonte do Passageiro e migrar somente recursos legados comprovadamente superiores/compatíveis.

## Motorista

- **Repositório canônico:** `franciel046631/movvi-go-connect`
- **Branch:** `feat/apois-motorista-producao-homologacao`
- **PR:** #1 — DRAFT; não mesclar antes do E2E físico Passageiro ↔ Motorista.
- **Stack:** React 19, Vite, TanStack Router/Start, TypeScript, Capacitor 8, Supabase JS, FCM/Push Notifications, Geolocation e Android Foreground Service.
- **Package:** `com.apois.motorista`.
- **Supabase mobile:** `vqtucstyduxrqjgyigfk`.
- **Firebase Android:** projeto `movvi-4d041`, cliente `com.apois.motorista`.
- **Decisão:** preservar a implementação operacional migrada do MOVVI, rebrandear/consolidar e não reconstruir do zero.

### Consolidação de ambiente do Motorista

A divergência histórica em que `.env` e `supabase/config.toml` apontavam para `ekddifjpbieuainvjlbl` foi eliminada desta branch:

- `supabase/config.toml` agora aponta para `vqtucstyduxrqjgyigfk`;
- `.env` local com referências/chaves antigas deixou de ser versionado;
- `.gitignore` protege `.env` locais;
- `.env.example` contém somente placeholders;
- `.env.mobile` contém apenas configuração browser-safe necessária ao build mobile e é validado pelo CI;
- o CI rejeita referências ativas aos project refs legados conhecidos.

Nenhum `service_role`, webhook secret ou segredo de gateway é permitido no bundle mobile.

## Admin

- **Repositório:** `franciel046631/movvi-go-connect`
- **Branch:** `feat/apois-admin-supabase-oficial-homologacao`
- **PR:** #2 — DRAFT; não mesclar antes do E2E físico.
- **Decisão:** preservar o Admin legado útil, rebrandear e migrar cada operação para contratos server-side compatíveis com o Supabase oficial.
- **Pendência de consolidação:** a branch Admin ainda deve eliminar a referência antiga de `supabase/config.toml`; o runtime `.env` já aponta para `vqtucstyduxrqjgyigfk`. Essa correção será feita e validada na fase do Admin sem merge antecipado.

## Backend

### Runtime canônico

A autoridade de dados é o Supabase oficial `vqtucstyduxrqjgyigfk`: schema vivo, RLS, RPCs e Edge Functions efetivamente implantadas e compatíveis com os apps atuais.

Server Functions/rotas TanStack existentes nos frontends só permanecem quando não duplicam autoridade de negócio e quando delegam ao contrato server-side canônico.

### Backends standalone legados

- `franciel046631/movvi-backend-standalone`
- `franciel046631/APOIS`

Ambos contêm implementações úteis (rotas, pagamentos, Mercado Pago/Asaas, payout, KYC e auditoria), porém foram construídos contra gerações/projetos anteriores. São **fontes de migração**, não fontes automáticas de verdade.

## Supabase

### Production / homologação oficial

- **Nome:** APOIS Produção
- **Project ref:** `vqtucstyduxrqjgyigfk`
- **Região:** `sa-east-1`
- **Status auditado:** ativo/saudável.

### Referências legadas encontradas

| Project ref | Origem | Decisão |
|---|---|---|
| `vqtucstyduxrqjgyigfk` | APOIS Corridas atual | **MANTER / OFICIAL** |
| `ekddifjpbieuainvjlbl` | configuração histórica `movvi-go-connect` | **REMOVER DO RUNTIME** |
| `wqbtnfbvqtkyywfcqjwa` | MOVVI Produção / backend standalone | **LEGADO; NÃO USAR PARA APOIS CORRIDAS CONSOLIDADO** |
| `zjphbuvcapwyuynadgdt` | Passageiro antigo | **LEGADO** |

O projeto `sbvhdgyuuperszlsllji` pertence ao **APOIS ENTREGAS** e está explicitamente fora do escopo.

### Development / staging

Não há project ref separado de development/staging do APOIS Corridas confirmado como canônico. Não inventar. A baseline deverá ser validada em banco vazio/ambiente efêmero antes de qualquer promoção a produção.

## Identidade canônica

Conforme `IDENTITY_MODEL.md` e o schema vivo:

- `auth.users.id` = identidade de autenticação;
- `public.users.id` = identidade operacional do usuário;
- `public.users.auth_user_id -> auth.users.id`;
- `public.drivers.id` = entidade Motorista;
- `public.drivers.user_id -> public.users.id` (1:1);
- `rides.passenger_id -> public.users.id`;
- `rides.driver_id` e `rides.accepted_driver_id -> public.drivers.id`;
- candidatos/ofertas usam `public.users.id` quando o contrato server-side assim define, sem misturar com `drivers.id`.

## Schema vivo canônico — decisões confirmadas

- `rides` usa `encoded_polyline`, `cancellation_reason`, `security_code`, `driver_latitude/driver_longitude/driver_heading` e timestamps explícitos de lifecycle;
- `tariff_rules` usa o modelo estruturado `category_id/base_fare/min_fare/per_km/per_min/stop_fee/fixed_fee/dynamic_multiplier` e extras de serviço;
- storage sensível do motorista está em buckets privados;
- existem `driver_wallets`, `driver_wallet_transactions`, `driver_withdrawals`, mas só serão considerados ledger final depois do settlement canônico;
- existem tokens/prefs/logs de notificação e RPCs para registrar/desativar token;
- existem tabelas de SOS/emergência, que precisam de E2E real para serem homologadas.

## Código legado a migrar seletivamente

- fluxos operacionais do Motorista MOVVI já migrados e ainda úteis;
- Admin MOVVI útil;
- SOS, incidentes, sharing, recibo, wallet/payout e notificações quando a implementação for superior e compatível;
- abstrações de pagamento do backend standalone após mapear finalidade/provedor.

## Código que não é fonte canônica

- `franciel046631/movvidriver` — protótipo separado;
- `franciel046631/say-hello-buddy-23` — Passageiro antigo;
- `franciel046631/SITEMOVVI` — site/protótipo separado;
- `franciel046631/APOIS` e `franciel046631/movvi-backend-standalone` — backend legado/candidato a migração, não autoridade automática.

## Regras de proteção

1. PR #1 Motorista permanece DRAFT.
2. PR #7 Passageiro permanece DRAFT.
3. PR #2 Admin permanece DRAFT.
4. Nenhum merge até E2E físico e quality gates.
5. `franciel046631/apois-entregas` não será alterado.
6. Nenhuma migration destrutiva em produção.
7. Frontend nunca é autoridade de preço final, pagamento, role ou status de corrida.
8. Feature não é pronta apenas porque build passou ou botão apareceu.
9. Divergências são registradas em `MIGRATION_DECISIONS.md` como MANTER/MIGRAR/REMOVER.
