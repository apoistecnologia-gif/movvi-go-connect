# APOIS CORRIDAS — PAYMENT PROVIDER MAP

> Fase 5. Mapeamento baseado no GitHub atual e no Supabase oficial `vqtucstyduxrqjgyigfk`. Nenhuma credencial foi criada ou copiada para o repositório.

## Fronteira arquitetural

O gateway **não calcula tarifa, ganho do Motorista ou receita APOIS**.

```text
Ride/Fare Engine
  -> RideSettlement
  -> PaymentProvider (somente movimentação externa)
  -> webhook verificado
  -> settlement paid/refunded
  -> Driver Ledger / Wallet
  -> Platform Ledger
```

O contrato provider-agnostic está em:

`supabase/functions/_shared/payment-provider.ts`

## Mercado Pago

### Estado comprovado no Supabase oficial

Ativo para **multa de cancelamento**:

- `create-cancellation-fee-charge` — JWT obrigatório;
- `cancellation-fee-webhook` — webhook público com validação HMAC/secret;
- criação de Pix usa idempotency key por multa;
- webhook relê o recurso no Mercado Pago;
- valida valor contra a multa persistida;
- `payment_webhook_receipts` evita duplicação;
- somente webhook liquida/reverte a multa.

### Decisão

**MANTER** este uso enquanto for o fluxo ativo comprovado.

A Fase 5 corrige a reversão da multa para também estornar o crédito da carteira do Motorista ou criar saldo devedor quando necessário.

### Corrida eletrônica

No Supabase oficial auditado não existe Edge Function ativa de cobrança eletrônica da **corrida** por Mercado Pago. Logo, Mercado Pago não é declarado automaticamente como gateway canônico da corrida apenas porque é usado para multa.

## Asaas

### Estado no legado

`movvi-backend-standalone` contém implementação server-only de Asaas com:

- customer;
- cobrança mensal;
- assinatura mensal;
- Pix;
- parse de webhook.

O próprio código é uma geração MOVVI e possui textos/contratos antigos. Não está entre as Edge Functions ativas do Supabase oficial auditado.

### Decisão

**MIGRAR somente se uma finalidade comercial atual exigir Asaas.**

Não promover o adapter legado para produção por simples existência do código.

## Mensalidade Motorista

Existem implementações históricas diferentes para mensalidade (Asaas e Mercado Pago). O Supabase oficial atual possui `drivers.subscription_status`, porém as Edge Functions ativas auditadas nesta fase não incluem um motor completo de assinatura mensal.

Decisão:

- manter `subscription_status` como gating de dispatch onde já existe;
- não inventar `preapproval_id`, plano ou recorrência inexistente;
- quando a mensalidade for consolidada, identificar se o objeto externo é assinatura recorrente real ou cobrança avulsa mensal e nomear o banco corretamente.

## Pagamento de corrida

O domínio canônico agora separa:

- `cash` — confirmação pelo Motorista atribuído após finalização;
- `wallet` — débito server-side na Carteira APOIS;
- `pix|credit|debit` — somente gateway/webhook/service role pode marcar como pago.

O provider eletrônico de corrida fica em configuração (`finance.electronic_payment_provider`) e começa **sem provedor ativo inventado**.

## Payout

A baseline canônica implementa:

- reserva atômica da carteira;
- `driver_withdrawals` com idempotency key;
- débito da wallet no pedido;
- conclusão por serviço;
- reembolso idempotente em falha.

O provider externo de payout fica em configuração (`finance.payout_provider`) e começa sem provedor ativo inventado. A integração automática externa deve ser conectada quando o provider/credenciais reais estiverem disponíveis.

## Regra comercial de taxa por corrida

A identidade visual oficial do Motorista informa **100% do valor das corridas para o Motorista / sem taxa por corrida**. Portanto a baseline torna isso configuração explícita:

`finance.platform_fee_percent = 0`

A Fare/Settlement Engine não contém porcentagem escondida. Uma futura alteração comercial deve mudar configuração/regras de forma auditável, não criar uma segunda fórmula.

## Secrets

Secrets de gateway continuam exclusivamente server-side. Nenhum token Mercado Pago/Asaas ou chave privada é versionado no frontend.
