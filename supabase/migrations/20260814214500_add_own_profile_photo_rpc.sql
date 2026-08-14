-- APOIS Corridas: profile tables are read-only to authenticated clients.
-- Persist an authenticated user's private profile-photo path through a narrow
-- SECURITY DEFINER RPC instead of client-side table UPDATE attempts.

create or replace function apois_rpc_private.set_own_profile_photo(_storage_path text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_user public.users%rowtype;
  v_path text := nullif(btrim(coalesce(_storage_path,'')),'');
begin
  if v_actor is null then
    raise exception 'unauthorized' using errcode='42501';
  end if;

  if v_path is null
     or split_part(v_path,'/',1) <> v_actor::text
     or not exists (
       select 1
       from storage.objects o
       where o.bucket_id='profile-photos'
         and o.name=v_path
         and coalesce(o.metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp')
     ) then
    raise exception 'invalid_profile_photo' using errcode='22023';
  end if;

  select * into v_user
  from public.users u
  where u.auth_user_id=v_actor
    and u.deleted_at is null
  for update;

  if not found then
    raise exception 'profile_missing' using errcode='P0002';
  end if;

  update public.users
     set avatar_url=v_path,
         updated_at=now()
   where id=v_user.id;

  update public.drivers
     set photo_url=v_path,
         updated_at=now()
   where user_id=v_user.id;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(
    v_actor,
    'profile.photo.updated',
    'user',
    v_user.id::text,
    jsonb_build_object('storage_path',v_path,'driver_profile_updated',exists(select 1 from public.drivers d where d.user_id=v_user.id))
  );

  return jsonb_build_object(
    'ok',true,
    'user_id',v_user.id,
    'storage_path',v_path
  );
end;
$function$;

revoke execute on function apois_rpc_private.set_own_profile_photo(text) from public, anon, authenticated;
grant execute on function apois_rpc_private.set_own_profile_photo(text) to service_role;

create or replace function public.set_own_profile_photo(_storage_path text)
returns jsonb
language sql
security definer
set search_path to ''
as $function$
  select apois_rpc_private.set_own_profile_photo($1);
$function$;

revoke execute on function public.set_own_profile_photo(text) from public, anon;
grant execute on function public.set_own_profile_photo(text) to authenticated, service_role;
