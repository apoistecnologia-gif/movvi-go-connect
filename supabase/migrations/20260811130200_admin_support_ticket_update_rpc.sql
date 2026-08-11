create or replace function public.admin_update_support_ticket(_ticket_id uuid, _status text, _priority text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_before public.passenger_support_tickets%rowtype;
  v_after public.passenger_support_tickets%rowtype;
  v_status text := lower(btrim(coalesce(_status,'')));
  v_priority text := lower(btrim(coalesce(_priority,'')));
begin
  if v_actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not private.has_permission('support.read') then raise exception 'forbidden' using errcode='42501'; end if;
  if v_status not in ('open','in_progress','resolved','closed') then raise exception 'invalid_support_status' using errcode='22023'; end if;
  if v_priority not in ('low','normal','high','urgent') then raise exception 'invalid_support_priority' using errcode='22023'; end if;

  select * into v_before
  from public.passenger_support_tickets
  where id=_ticket_id
  for update;
  if not found then raise exception 'support_ticket_not_found' using errcode='P0002'; end if;

  update public.passenger_support_tickets
  set status=v_status,
      priority=v_priority,
      updated_at=now()
  where id=_ticket_id
  returning * into v_after;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values (
    v_actor,
    'admin.support_ticket.updated',
    'support_ticket',
    _ticket_id::text,
    jsonb_build_object(
      'protocol',v_after.protocol,
      'before',jsonb_build_object('status',v_before.status,'priority',v_before.priority),
      'after',jsonb_build_object('status',v_after.status,'priority',v_after.priority)
    )
  );

  return to_jsonb(v_after);
end;
$$;

revoke all on function public.admin_update_support_ticket(uuid,text,text) from public,anon;
grant execute on function public.admin_update_support_ticket(uuid,text,text) to authenticated;
