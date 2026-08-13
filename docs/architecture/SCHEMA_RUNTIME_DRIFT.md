# APOIS CORRIDAS — SCHEMA / RUNTIME DRIFT

> Gerado durante a Fase 3 ao substituir o antigo pseudo-typecheck por `tsc --noEmit`. O objetivo é impedir que erros históricos fiquem escondidos. Este documento não transforma código legado em fonte canônica.

## Por que o typecheck global falhou

O repositório `movvi-go-connect` contém gerações históricas de Passageiro, Motorista, Admin e web no mesmo grafo TypeScript. O build APK do Motorista usa `src/mobile-route-tree.motorista.ts`, que não importa rotas `/passageiro/*` nem `/admin/*`; o Passageiro canônico, por sua vez, está no repositório separado `say-hello-buddy-23-84b5dcbf`.

O `tsc --noEmit` global revelou que dezenas de telas/serviços legados ainda consultam tabelas/colunas que **não existem no schema vivo oficial**. Esses erros não devem ser mascarados por `any`, nem usados para reintroduzir o schema antigo.

A Fase 3 tem um typecheck próprio (`tsconfig.core.json`) para o Core Ride canônico. O typecheck completo de cada aplicação será fechado nas fases 6, 7 e 8 e novamente no Quality Gate final.

## Divergências confirmadas

### Usuário/perfil

Código legado ainda espera campos em `public.users` como:

- `emergency_contact_name`;
- `emergency_contact_phone`;
- `email_verified_at`;
- `phone_verified_at`.

Decisão: **MIGRAR** contatos para as tabelas canônicas de contatos de emergência e obter verificação a partir da fonte de autenticação correta; **REMOVER** os campos fictícios de queries.

### Suporte

Código legado usa `support_tickets`; o schema oficial possui `passenger_support_tickets`.

Decisão: **MIGRAR** fluxo que for necessário ao contrato canônico, sem recriar `support_tickets` apenas para satisfazer frontend antigo.

### Categorias

Código legado espera enum `ride_category`; o schema oficial usa `ride_categories` + `code` e `rides.category` textual por compatibilidade atual.

Decisão: **REMOVER** dependência do enum inexistente e utilizar os contratos canônicos.

### Auditoria administrativa

Código legado usa `admin_audit_logs`; o schema vivo possui `audit_logs`.

Decisão: **MIGRAR** Admin para `audit_logs`, acrescentando os campos realmente necessários por migration deliberada na Fase 8 caso o modelo canônico exija.

### Preferências do Motorista

Código legado usa tabela `driver_preferences` e campos de UX/aceite que não existem no schema vivo.

Decisão: **NEEDS_PRODUCT_MIGRATION**. Preferências realmente necessárias serão modeladas explicitamente na Fase 7; não criar tabela antiga por reflexo.

### Favoritos/recentes

Código legado usa `favorite_places` e `recent_places` ausentes do schema oficial atual.

Decisão: a fonte canônica do Passageiro é o repositório APOIS mais novo; resolver na Fase 6 a partir do comportamento daquele app, não do legado deste repositório.

### Financeiro

Código legado referencia:

- `financial_transactions`;
- `subscriptions`;
- `subscription_plans`;
- `driver_payment_events`;
- diversos campos Asaas/Mercado Pago antigos dentro de `drivers`;
- campos antigos de wallet como `wallet_balance` e `pending_balance`.

O schema vivo possui `driver_wallets`, `driver_wallet_transactions`, `driver_withdrawals`, `payment_methods` e `payment_webhook_receipts`, mas ainda não possui settlement canônico de corrida.

Decisão: **REMOVER como autoridade** as abstrações antigas e construir Settlement/Ledger na Fase 5. Integrações de gateway serão preservadas apenas quando finalidade e contratos forem comprovados.

### Diagnóstico GPS

Código legado usa `gps_diagnostics`, ausente do schema oficial.

Decisão: não recriar automaticamente. Telemetria operacional necessária será definida na Fase 7/12 sem contaminar o core de presença.

### Notificações

Código legado usa `notification_inbox`, `notifications_broadcast` e preferências antigas (`sound`, `vibration`, `payment_reminders` etc.).

O schema canônico possui `notifications`, `notification_logs`, `user_notification_tokens` e `user_notification_preferences`.

Decisão: **MIGRAR** para Notification Engine canônica e **REMOVER** contratos antigos.

### Ride lifecycle legado

Ocorrências antigas confirmadas:

- `safety_code` -> canônico `security_code`;
- `cancel_reason` -> canônico `cancellation_reason`;
- `driver_lat`/`driver_lng` -> canônico `driver_latitude`/`driver_longitude`;
- `driver_vehicle` agregado inexistente -> snapshot canônico de modelo/cor/placa;
- `driver_public_locations` inexistente;
- inserts incompletos de `rides` sem `origin`, `destination`, `payment_method`, `request_key`.

Decisão: **REMOVER/MIGRAR** conforme aplicação. Nenhuma dessas colunas antigas será reintroduzida.

### Tarifas

Código legado/Admin usa `category_key / field_key / value`.

Schema oficial usa `category_id`, `base_fare`, `min_fare`, `per_km`, `per_min`, `stop_fee`, `fixed_fee`, `dynamic_multiplier` e extras.

Decisão: **REMOVER** o modelo antigo. Fare Engine canônica usa o modelo vivo.

### Admin

Rotas administrativas antigas ainda referenciam tabelas/controles como:

- `admin_users_meta`;
- `backups`;
- `coupons`;
- `notifications_broadcast`;
- `payment_gateways`;
- `security_settings`;
- `support_tickets` / `support_ticket_notes`;
- `incident_reports`;
- `admin_passenger_notes`;
- `ride_ratings`;
- `subscriptions` / `subscription_plans`.

Decisão: a Fase 8 precisa classificar tela a tela: **MANTER funcionalidade**, **MIGRAR contrato**, ou **REMOVER/explicitar indisponível**. É proibido criar tabelas fake só para fazer controles visuais parecerem funcionais.

## Erros do Motorista que entram na Fase 7

As rotas realmente presentes no bundle do Motorista incluem divergências que precisam ser eliminadas antes da homologação final, entre elas:

- `motorista.app.tsx`: `cancel_reason`;
- `motorista.corridas.$id.tsx`: `passenger_photo_url`, `driver_rating_comment`, `driver_vehicle`, `safety_code` e outros contratos antigos;
- `motorista.assinatura.tsx`: campos financeiros/assinatura históricos não existentes em `drivers`.

Esses itens são **P0/P1 da Fase 7** e não podem sobreviver ao quality gate do APK.

## Regra para resolução

Para cada erro de schema:

1. confirmar se o arquivo está no runtime canônico da aplicação;
2. comparar com schema vivo e fonte canônica daquele produto;
3. se a funcionalidade for válida, **MIGRAR** para o contrato canônico;
4. se for legado duplicado/fora da fonte canônica, **REMOVER do runtime produtivo**;
5. nunca criar tabela/coluna antiga apenas para silenciar TypeScript;
6. nunca usar `any` como correção arquitetural;
7. voltar a executar typecheck de aplicação e registrar o resultado.

## Quality Gate

O typecheck global falho é um **achado de auditoria**, não um sucesso. Ele só poderá ser considerado resolvido quando os quality gates específicos de Passageiro, Motorista e Admin passarem e, na Fase 12, a varredura final não encontrar contratos antigos ativos.
