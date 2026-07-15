# Backend TanStack Standalone — MOVVI (novo Supabase)

Objetivo: entregar um projeto Node/TanStack independente, com **exatamente** as Server Functions e Server Routes que os APKs consomem, apontado ao Supabase `wqbtnfbvqtkyywfcqjwa`. Nenhuma alteração nos APKs, no backend Cloud atual, ou no painel standalone.

## 1. Auditoria — o que os APKs realmente exigem

### Server Functions chamadas diretamente pelas rotas mobile
Levantado varrendo `src/routes/passageiro.*.tsx`, `motorista.*.tsx`, `index.tsx`, `diagnostico.tsx`, `t.$token.tsx`:

- `@/lib/driverAuth.functions` — cadastro/login/perfil motorista
- `@/lib/driverDocuments.functions` — upload de documentos (usa `driver-selfies`, `driver-cnh`, `vehicle-documents`)
- `@/lib/geocode.functions` — autocomplete/reverse geocode (Google Maps server-side)
- `@/lib/routes.functions` — cálculo de rota + preço
- `@/lib/payments/subscription.functions` — assinatura Mercado Pago do motorista

Cada uma acessa Postgres via `requireSupabaseAuth` (RLS como usuário) e às vezes `supabaseAdmin` (service role) dentro do handler.

### Edge Functions chamadas pelos APKs (via `supabase.functions.invoke`)
- `request-driver-payout` (motorista solicita saque Pix)

### Edge Functions necessárias no ecossistema (webhooks / cron / server-side MP)
Presentes hoje no projeto atual, faltando no novo (você reportou só `request-ride` publicada):
- `approve-driver-and-create-mercadopago-subscription`
- `create-my-mercadopago-subscription`
- `create-cancellation-fee-charge`
- `regenerate-driver-mercadopago-charge`
- `mercadopago-webhook` (verify_jwt = false — endpoint público do MP)
- `dispatch-broadcast-test`
- `request-driver-payout`

Além disso, as **Server Routes públicas** (cron):
- `/api/public/hooks/activate-scheduled-rides`
- `/api/public/hooks/renew-driver-subscriptions`

Essas Server Routes vão junto no backend standalone (não são Edge Functions).

### RPCs SQL usadas (client + server)
`has_role`, `get_driver_public_profile`, `get_driver_public_stats`, `get_driver_amenities_public`, `get_passenger_public_profile`, `get_driver_stats`, `get_driver_home_kpis`, `get_passenger_stats`, `get_ride_by_share_token`, `activate_due_scheduled_rides`, `request_driver_withdrawal`, `settle_cancellation_fee`, `mark_driver_withdrawal_paid`, `mark_driver_withdrawal_failed`, `recompute_driver_rating`, `recompute_passenger_rating`, `auto_suspend_overdue_subscriptions`, `admin_analytics_*` (7 variantes), `generate_share_token`, e triggers auxiliares (`handle_new_user`, `sync_driver_public_location`, `sync_ride_rating`, `enforce_single_rating`, `apply_cancellation_policy`, `validate_scheduled_ride`, `prevent_driver_privileged_updates`, `sync_driver_financial_status`, `sync_driver_subscription_from_subscriptions`, `set_ride_share_token`, `set_updated_at`/`tg_set_updated_at`/`tg_touch_updated_at`).

Total esperado: **~30 funções**. Você reportou **27 no novo Supabase** → há **~3 funções faltando** (a confirmar).

### Tabelas usadas (55 esperadas)
Confirmadas 55 no novo → OK.

### Buckets Storage esperados
`driver-selfies`, `driver-cnh`, `vehicle-documents`, `profile-photos`, `ride-attachments`, `downloads`. Você criou os 3 primeiros + `profile-photos`. **Faltam:** `ride-attachments`, `downloads` (ambos privados) — e as **policies** de cada bucket precisam ser recriadas.

### Secrets no backend novo
Obrigatórios no host (nunca `VITE_`):
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWKS`
- `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `MERCADOPAGO_BASE_URL`
- `CRON_SECRET`
- `GOOGLE_MAPS_BROWSER_KEY` (usado por `geocode.functions.ts` server-side)
- `SESSION_SECRET` (gerado)

## 2. Gaps no novo Supabase que precisam ser fechados antes do go-live

1. **6 Edge Functions ausentes** — sem elas, assinatura MP, cobrança de cancelamento, saque, aprovação de motorista e webhook do MP não funcionam. Precisam ser deployadas no novo projeto.
2. **~3 funções SQL a confirmar** (27 vs 30 esperadas).
3. **Buckets `ride-attachments` e `downloads`** ausentes + policies de todos os buckets.
4. **CRON jobs** (`pg_cron`) do Supabase antigo — cadastrar equivalentes no novo apontando para as Server Routes públicas do novo backend + `CRON_SECRET`.
5. **Google OAuth / Auth providers** — reconfigurar no novo projeto (Google client, redirect URIs, templates de e-mail, etc.).
6. **Trigger `handle_new_user`** ligado a `auth.users` — precisa estar presente para cada cadastro criar linha em `public.users` + `user_roles`.

## 3. O que vai no ZIP `movvi-backend-standalone`

Projeto **TanStack Start** puro (sem Lovable Cloud), pronto para publicar em qualquer host que aceite workers/Node (Vercel, Cloudflare Workers, Fly, Railway). Contém:

- `src/routes/__root.tsx` mínimo (health check + landing "backend only")
- **Todas as `.functions.ts`** que os APKs consomem, copiadas 1-para-1
- **Todas as Server Routes** de `api/public/*` (webhooks/cron)
- **Middleware** `requireSupabaseAuth` + attacher gerado
- **`client.server.ts`** lendo apenas `process.env.*` (sem VITE_)
- **`client.ts`** (para o `supabase.functions.invoke` server-to-edge) sem persistência
- **`supabase/functions/*`** — as 7 Edge Functions copiadas (para você fazer `supabase functions deploy` no novo projeto)
- **`.env.example`** com todas as variáveis necessárias documentadas
- **`README.md`** com passos de deploy (Vercel + Cloudflare) e de configuração do Supabase novo
- **`scripts/verify-parity.mjs`** — script que consulta o novo Supabase e lista o que ainda falta (funções SQL, buckets, edge fns) antes de você promover a URL

Excluído do ZIP: painel admin, código React de passageiro/motorista, Capacitor, tudo que não seja server-side.

## 4. Como você vai publicar (roteiro pós-ZIP)

```text
1. Extrair ZIP → `cd movvi-backend-standalone && npm install`
2. Preencher .env local com as chaves do novo Supabase
3. `node scripts/verify-parity.mjs` → corrigir gaps SQL/buckets/edge fns
4. `supabase link --project-ref wqbtnfbvqtkyywfcqjwa`
5. `supabase functions deploy` (as 7 fns), configurar secrets no dashboard
6. Deploy Node em Vercel/Cloudflare → obter URL pública ex. movvi-api.vercel.app
7. Teste manual: POST /_serverFn/... com bearer de teste
8. Só depois: eu troco MOBILE_REMOTE_BASE nos APKs
```

## 5. O que NÃO vai acontecer neste passo

- Nenhum arquivo dos APKs alterado
- `MOBILE_REMOTE_BASE` continua em `https://movvi-go-connect.lovable.app`
- Painel admin standalone (`movvi-admin-standalone`) intocado
- Backend Cloud antigo continua no ar durante toda a transição

## 6. Confirmações que preciso antes de gerar o ZIP

1. Confirma o escopo minimalista acima (só o subset consumido pelos APKs + Edge Fns/webhooks)? Ou quer o backend **completo** com as funções admin também (para futuro)?
2. Alvo de deploy preferido: **Vercel Node**, **Cloudflare Workers**, ou **agnóstico** (README cobre os dois)?
3. OK que o ZIP inclua apenas o código-fonte das 7 Edge Functions para você deployar via CLI (`supabase functions deploy`), já que não tenho acesso ao dashboard do novo projeto?

Responda 1/2/3 e eu gero o ZIP em seguida.
