
## Situação atual (já existe)

- `src/lib/payments/asaas.server.ts` — cliente HTTP server-only (sandbox/prod, `ASAAS_API_KEY`).
- `src/lib/payments/subscription.functions.ts` — server fn `createDriverMonthlyCharge` (cobra sob demanda).
- `src/routes/api/public/asaas-webhook.ts` — endpoint público com verificação de `ASAAS_WEBHOOK_SECRET`.
- `drivers.asaas_customer_id`, `subscription_status`, `subscription_expires_at`, `payment_status`.
- Tabela `subscriptions` + trigger `trg_sync_driver_subscription` que espelha status em `drivers`.

## O que falta (vou construir)

### 1. Banco (1 migration)
- Adicionar em `drivers`: `asaas_subscription_id`, `financial_status` (enum: `pending|active|overdue|cancelled|inactive`), `subscription_value`, `next_due_date`, `last_payment_status`, `last_payment_id`.
- Criar tabela `driver_payment_events` (id, driver_id, asaas_event, asaas_payment_id, asaas_subscription_id, status, value, due_date, paid_at, raw_payload jsonb, created_at) + RLS (só admin lê; service_role escreve).
- Trigger que, quando `subscriptions.status` muda, atualiza também `drivers.financial_status` e `next_due_date`.

### 2. Cliente Asaas (server-only)
- Adicionar em `asaas.server.ts`: `createSubscription({customerId, value, nextDueDate, description})` chamando `POST /subscriptions` (ciclo MONTHLY, billingType BOLETO/PIX/UNDEFINED).
- Retornar `{ subscriptionId, firstPaymentId, invoiceUrl, dueDate }`.

### 3. Server function `approveDriverAndCreateSubscription`
- Arquivo novo: `src/lib/payments/approveDriver.functions.ts`.
- Guarda: só usuário com role `admin` (via `has_role`).
- Fluxo:
  1. Valida motorista tem `name`, `email`, `cpf_cnpj`, `phone`, `city`, `state`. Se faltar, retorna erro claro (não aprova).
  2. Idempotente: se já tem `asaas_subscription_id`, apenas retorna dados existentes.
  3. `ensureCustomer` → salva `asaas_customer_id` se novo.
  4. `createSubscription` no Asaas (R$ 49,90, mensal, vencimento hoje+3).
  5. Update `drivers`: `approval_status='aprovado'`, `approved_at=now()`, `asaas_subscription_id`, `subscription_value=49.90`, `next_due_date`, `financial_status='pending'`.
  6. Cria row em `subscriptions` (pending) e loga em `driver_payment_events`.
  7. Retorna `{ ok, invoiceUrl, dueDate, subscriptionId }` ou erro estruturado.

### 4. Webhook (ajuste em `asaas-webhook.ts`)
- Aceitar header `asaas-access-token` **ou** `ASAAS_WEBHOOK_TOKEN` como nome de env alias (mantém compat).
- Sempre gravar em `driver_payment_events` (raw_payload).
- Tratar `PAYMENT_CREATED / RECEIVED / CONFIRMED / OVERDUE / DELETED / REFUNDED`.
- Localizar motorista via `asaas_subscription_id` (payload traz `payment.subscription`) ou fallback por `asaas_payment_id`.
- Atualizar `drivers.financial_status`, `last_payment_status`, `last_payment_id`, `next_due_date` (usa `payment.nextDueDate` quando vier).

### 5. Admin UI (`src/routes/admin.motoristas.tsx`)
- No botão "Aprovar": chamar `approveDriverAndCreateSubscription` via `useServerFn` (loading, toast de sucesso/erro).
- Nunca marcar como aprovado localmente se a fn retornar erro.
- Perfil do motorista (dialog/card já existente): mostrar `financial_status`, `subscription_value`, `next_due_date`, `asaas_subscription_id`, `last_payment_status` + link `invoiceUrl` da última cobrança.

### 6. Carteira do motorista
- Em `src/routes/motorista.carteira.tsx` (ou `motorista.assinatura.tsx` já existente): card "Mensalidade MOVVI" com status colorido, próximo vencimento, botão "Pagar mensalidade" abrindo `invoiceUrl` em nova aba quando `financial_status ∈ {pending, overdue}`.

### 7. Secrets (você precisa fornecer)
- **`ASAAS_API_KEY`** — pegue em https://sandbox.asaas.com → Integrações → Chave de API.
- **`ASAAS_WEBHOOK_TOKEN`** — string que você define; vai no header `asaas-access-token`.
- **`ASAAS_ENVIRONMENT`** — `sandbox` (default) ou `production`. Já está codado assim (`ASAAS_BASE_URL` derivada, não precisa secret separado).

Vou pedir esses secrets em uma mensagem separada após o plano ser aprovado.

## Fluxo end-to-end depois de pronto

```
Admin clica "Aprovar"
  → approveDriverAndCreateSubscription
    → Asaas /customers  (se novo)
    → Asaas /subscriptions R$49,90 mensal
    → drivers: approved_at, financial_status=pending, next_due_date, ids
    → subscriptions: pending
  → Toast "Motorista aprovado — cobrança gerada"

Asaas cobra → webhook PAYMENT_CONFIRMED
  → driver_payment_events (raw)
  → subscriptions.status=active
  → drivers.financial_status=active

Vence sem pagar → webhook PAYMENT_OVERDUE
  → drivers.financial_status=overdue
  → Motorista vê banner "Regularize" + botão "Pagar mensalidade"
```

## Fora do escopo desta fase (fica pra depois)
- Retentativa automática (cron para recalcular status vencido).
- Cancelamento de assinatura pelo admin.
- Desconto de créditos de multa na próxima fatura (Fase 3 do plano original).
- Split de repasse ao motorista pelo valor da corrida.

Aprova esse plano? Se sim, ao começar a implementação vou pedir os 2 secrets do Asaas.
