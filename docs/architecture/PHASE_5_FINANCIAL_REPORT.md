# APOIS CORRIDAS — FASE 5 / FINANCEIRO

> Status: **concluída no escopo canônico e testável da Fase 5**. Nenhuma migration ou Edge Function financeira nova foi implantada no Supabase oficial nesta fase. Toda DDL foi validada em PostgreSQL 16 efêmero.

## Definições canônicas

- **GMV**: valor bruto econômico da corrida antes de desconto (`gross_amount_cents`).
- **Passenger Charge**: valor efetivamente cobrado do passageiro (`passenger_charge_cents`).
- **Driver Earnings**: ganho do motorista após regra de plataforma (`driver_earning_cents`).
- **Platform Revenue**: parcela da corrida destinada à APOIS (`platform_fee_cents`).
- **Provider Fee**: custo do gateway (`payment_provider_fee_cents`), contabilizado separadamente.
- **Refund**: valor devolvido ao passageiro (`refunded_amount_cents`) com reversão de ledger/carteira aplicável.
- **Withdrawal**: saída solicitada pelo motorista a partir do saldo disponível, com reserva, idempotência e processamento por provider externo.

Nenhum desses conceitos é tratado como sinônimo no banco ou ledger.

## Regra comercial de corrida

A referência visual oficial do APOIS Motorista informa que o motorista recebe **100% do valor das corridas** e não há taxa por corrida. Por isso a arquitetura tornou a regra explícita em configuração:

`finance.platform_fee_percent = 0`

Não existe porcentagem escondida na Fare Engine ou no frontend.

## Settlement canônico

Baseline:

- `007_financial_settlement.sql`
- `008_financial_hardening.sql`

Entidade `ride_settlements` usa centavos inteiros e registra:

- ride/passenger/driver;
- gross;
- discount;
- passenger charge;
- platform fee;
- driver earning;
- provider fee;
- cash amount;
- wallet amount;
- refunded amount;
- payment method;
- payment status;
- settlement status/timestamps.

`ride_id` é UNIQUE, tornando a criação do settlement idempotente.

## Pagamento por forma

### Dinheiro

- finalização cria settlement pendente;
- somente o motorista atribuído pode confirmar dinheiro;
- pagamento é registrado em `ride_payments`;
- Driver Earnings entra no ledger;
- o valor **não** é creditado na carteira de saque, pois o motorista já recebeu fisicamente.

### Carteira APOIS

- débito ocorre server-side na carteira do passageiro;
- transaction do passageiro é idempotente;
- settlement é liquidado no mesmo domínio;
- Driver Earnings é creditado no ledger/carteira.

### PIX / cartão / débito

- o motorista não pode marcar como pago;
- somente a superfície service-role de webhook/provider pode chamar `settle_ride_electronic_payment`;
- valor externo precisa corresponder exatamente ao `passenger_charge_cents` persistido;
- `event_key`/provider geram idempotência;
- sucesso libera o saldo do motorista;
- falha permanece registrada sem falsificar pagamento.

## Ledgers

Criados:

- `driver_ledger_entries` — verdade econômica do motorista;
- `platform_ledger_entries` — receita/custos da APOIS;
- `passenger_wallet_transactions` — movimentações da carteira do passageiro;
- `driver_wallet_transactions` — movimentações operacionais da carteira do motorista.

A UI futura de Ganhos deve ler o ledger, não somar `rides.final_price`.

## Driver Wallet

`driver_wallets` passa a distinguir:

- `balance`;
- `available_balance`;
- `pending_balance`;
- `debt_balance`.

Corrida eletrônica finalizada mas ainda não confirmada pelo gateway fica pendente. Quando liquidada, o valor sai de pending e entra no disponível.

## Payout / saque

`driver_request_withdrawal` implementa:

- autenticação do motorista;
- idempotency key;
- lock da carteira;
- checagem de saldo disponível;
- bloqueio quando há `debt_balance`;
- criação de `driver_withdrawals`;
- reserva/débito da carteira;
- audit log.

Funções service-only concluem ou falham payout. Falha devolve a reserva exatamente uma vez. Se surgiu dívida financeira após a reserva, o reembolso do payout primeiro compensa a dívida e somente o restante volta ao disponível.

## Estornos

`reverse_ride_payment`:

- exige settlement efetivamente pago;
- evita duplicidade;
- estorna Driver Ledger;
- faz clawback da carteira;
- se o dinheiro já saiu da carteira, cria dívida;
- estorna Platform Ledger;
- devolve Carteira APOIS quando essa foi a origem;
- dinheiro físico exige processo operacional separado em vez de fingir refund automático.

## Multa de cancelamento

O fluxo ativo de multa do Supabase oficial usa Mercado Pago e webhook validado. A Fase 5 corrigiu uma lacuna importante no modelo baseline: um estorno de multa agora também precisa reverter o crédito que havia sido dado ao motorista. Se o motorista já sacou esse valor, é criado `debt_balance` e novos saques ficam bloqueados até compensação.

## Payment Providers

Mapa detalhado:

`docs/architecture/PAYMENT_PROVIDER_MAP.md`

Contrato provider-agnostic:

`supabase/functions/_shared/payment-provider.ts`

### Mercado Pago

Uso ativo comprovado no Supabase oficial: **multa de cancelamento**. O webhook relê o pagamento, valida assinatura/valor e utiliza `payment_webhook_receipts` para idempotência.

Não foi encontrado, no conjunto ativo auditado, um motor de cobrança eletrônica da **corrida** em produção; portanto não foi inventado que Mercado Pago já cumpra essa função.

### Asaas

Existe implementação histórica no backend standalone para cobranças/assinaturas/Pix, mas não está entre as Edge Functions ativas do Supabase oficial auditado. Permanece como código candidato a migração somente se houver finalidade comercial confirmada.

## Segurança/RLS

Novas tabelas financeiras têm RLS. Passageiro e motorista leem somente suas superfícies. Finance Admin recebe permissões explícitas. RPCs que recebem confirmação externa de pagamento/payout são service-role-only.

## Quality Gate realmente executado

Workflow:

`APOIS Corridas — Financial validation`

Run final: `31271387708`

Resultado: **SUCCESS**.

Passaram:

- Deno check do contrato de provider;
- semantic lint;
- fresh database baseline 000..008;
- integração settlement/wallet/cash/electronic payment;
- wallet debt guard;
- security/schema invariants;
- build da aplicação;
- invariantes finais.

Cenários financeiros testados:

1. PIX finalizado -> settlement pendente;
2. confirmação externa exata -> settled;
3. evento externo duplicado -> sem crédito duplicado;
4. provider fee separado;
5. dinheiro confirmado pelo motorista -> ledger sem crédito duplicado na wallet;
6. Carteira APOIS -> débito passageiro + crédito motorista;
7. saque idempotente/reservado;
8. falha de saque -> refund único;
9. multa paga -> crédito motorista;
10. reversão da multa -> clawback;
11. valor já sacado antes da reversão -> dívida do motorista;
12. motorista com dívida -> novo saque bloqueado.

## Pendências externas reais

A Fase 5 **não inventou** decisões que dependem do proprietário/contas externas:

1. **Gateway eletrônico das corridas** — definir qual provider contratado processará PIX/cartão/débito e fornecer credenciais/webhook de produção.
2. **Provider de payout** — definir/confirmar provider contratado e credenciais para transferências reais.
3. **Mensalidade do motorista** — confirmar arquitetura comercial final e se o objeto externo será assinatura recorrente real ou cobrança mensal avulsa antes de consolidar nomes/IDs no banco.

O core financeiro permanece provider-agnostic até essas decisões.

## Produção

Nenhuma tabela/RPC desta fase foi aplicada ao Supabase `vqtucstyduxrqjgyigfk`. Promoção para ambiente remoto exige migration incremental revisada e compatibilidade dos apps das fases 6–8.

## Escopo protegido

`franciel046631/apois-entregas` **não foi alterado**.

## Próxima fase

FASE 6 — Passageiro: integrar o core canônico, remover placeholders/botões mortos e concluir perfil, segurança, sharing, recibo, rating, legal, exclusão de conta e recuperação de senha mobile, preservando a identidade visual APOIS existente.
