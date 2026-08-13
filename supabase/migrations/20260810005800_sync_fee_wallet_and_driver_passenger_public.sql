-- Homologação física APOIS Corridas — carteira por multa + perfil público mínimo.
-- Não pertence e não toca o APOIS Entregas.

create or replace function public.apois_sync_passenger_wallet_fee_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_passenger_id uuid := coalesce(new.passenger_id, old.passenger_id);
  v_has_pending boolean;
  v_fee_reason constant text := 'Multa de cancelamento pendente. Quite a pendência antes de solicitar outra corrida.';
begin
  if v_passenger_id is null then
    return coalesce(new, old);
  end if;

  select exists (
    select 1
    from public.cancellation_fees cf
    where cf.passenger_id = v_passenger_id
      and cf.is_paid is not true
      and cf.paid_at is null
      and lower(coalesce(cf.status, 'pending')) not in (
        'paid', 'pago', 'cancelled', 'canceled', 'cancelada',
        'waived', 'forgiven', 'perdoada'
      )
  ) into v_has_pending;

  if v_has_pending then
    insert into public.passenger_wallets (passenger_id, is_blocked, blocked_reason, updated_at)
    values (v_passenger_id, true, v_fee_reason, now())
    on conflict (passenger_id) do update
      set is_blocked = true,
          blocked_reason = case
            when passenger_wallets.is_blocked
                 and passenger_wallets.blocked_reason is not null
                 and passenger_wallets.blocked_reason not ilike 'Multa de cancelamento pendente%'
              then passenger_wallets.blocked_reason
            else v_fee_reason
          end,
          updated_at = now();
  else
    update public.passenger_wallets
       set is_blocked = false,
           blocked_reason = null,
           updated_at = now()
     where passenger_id = v_passenger_id
       and blocked_reason ilike 'Multa de cancelamento pendente%';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_apois_sync_passenger_wallet_fee_block on public.cancellation_fees;
create trigger trg_apois_sync_passenger_wallet_fee_block
after insert or update of passenger_id, is_paid, paid_at, status or delete
on public.cancellation_fees
for each row execute function public.apois_sync_passenger_wallet_fee_block();

-- Sincroniza o estado já existente sem remover bloqueios administrativos.
insert into public.passenger_wallets (passenger_id, is_blocked, blocked_reason, updated_at)
select distinct cf.passenger_id,
       true,
       'Multa de cancelamento pendente. Quite a pendência antes de solicitar outra corrida.',
       now()
from public.cancellation_fees cf
where cf.is_paid is not true
  and cf.paid_at is null
  and lower(coalesce(cf.status, 'pending')) not in (
    'paid', 'pago', 'cancelled', 'canceled', 'cancelada',
    'waived', 'forgiven', 'perdoada'
  )
on conflict (passenger_id) do update
  set is_blocked = true,
      blocked_reason = case
        when passenger_wallets.is_blocked
             and passenger_wallets.blocked_reason is not null
             and passenger_wallets.blocked_reason not ilike 'Multa de cancelamento pendente%'
          then passenger_wallets.blocked_reason
        else excluded.blocked_reason
      end,
      updated_at = now();

update public.passenger_wallets pw
   set is_blocked = false,
       blocked_reason = null,
       updated_at = now()
 where pw.blocked_reason ilike 'Multa de cancelamento pendente%'
   and not exists (
     select 1
     from public.cancellation_fees cf
     where cf.passenger_id = pw.passenger_id
       and cf.is_paid is not true
       and cf.paid_at is null
       and lower(coalesce(cf.status, 'pending')) not in (
         'paid', 'pago', 'cancelled', 'canceled', 'cancelada',
         'waived', 'forgiven', 'perdoada'
       )
   );

create or replace function public.driver_get_passenger_public_for_ride(_ride_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_driver_id uuid;
  v_ride public.rides%rowtype;
  v_passenger public.users%rowtype;
  v_first_name text;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  v_profile_id := public.mobility_user_id();
  select d.id into v_driver_id
  from public.drivers d
  where d.user_id = v_profile_id;

  if v_driver_id is null then
    raise exception 'driver_profile_missing' using errcode = '42501';
  end if;

  select * into v_ride
  from public.rides r
  where r.id = _ride_id;

  if not found then
    raise exception 'ride_not_found' using errcode = 'P0001';
  end if;

  if not (
    v_ride.driver_id = v_driver_id
    or v_ride.accepted_driver_id = v_driver_id
    or (
      v_ride.status = 'procurar_motorista'
      and v_profile_id = any(coalesce(v_ride.candidate_driver_ids, '{}'::uuid[]))
      and not (v_profile_id = any(coalesce(v_ride.rejected_driver_ids, '{}'::uuid[])))
    )
  ) then
    raise exception 'ride_not_authorized' using errcode = '42501';
  end if;

  select * into v_passenger
  from public.users u
  where u.id = v_ride.passenger_id;

  if not found then
    return jsonb_build_object(
      'name', 'Passageiro',
      'phone', null,
      'avatar_url', null,
      'average_rating', null,
      'total_ratings', 0
    );
  end if;

  v_first_name := nullif(split_part(trim(coalesce(v_passenger.name, '')), ' ', 1), '');

  return jsonb_build_object(
    'name', coalesce(v_first_name, 'Passageiro'),
    'phone', v_passenger.phone,
    'avatar_url', v_passenger.avatar_url,
    'average_rating', v_passenger.average_rating,
    'total_ratings', v_passenger.total_ratings
  );
end;
$$;

revoke all on function public.apois_sync_passenger_wallet_fee_block() from public;
revoke all on function public.driver_get_passenger_public_for_ride(uuid) from public;
grant execute on function public.driver_get_passenger_public_for_ride(uuid) to authenticated;
