-- APOIS Corridas — feature gates financeiros fail-closed.
--
-- Até existir provedor real de cobrança da corrida e provedor real de payout
-- homologados ponta a ponta, nenhum cliente deve oferecer PIX/cartão de corrida
-- nem saque automático como se a integração estivesse pronta.

begin;

insert into public.app_settings (key, value, description, updated_at)
values (
  'finance.ride_electronic_payments_enabled',
  'false'::jsonb,
  'Habilita PIX/cartão para pagamento de corridas somente após checkout + webhook + settlement homologados.',
  now()
)
on conflict (key) do update
set value = excluded.value,
    description = excluded.description,
    updated_at = now();

insert into public.app_settings (key, value, description, updated_at)
values (
  'finance.driver_payouts_enabled',
  'false'::jsonb,
  'Habilita saques do motorista somente após provedor de payout real e homologação ponta a ponta.',
  now()
)
on conflict (key) do update
set value = excluded.value,
    description = excluded.description,
    updated_at = now();

commit;
