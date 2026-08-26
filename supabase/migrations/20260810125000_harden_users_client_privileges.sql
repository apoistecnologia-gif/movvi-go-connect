-- APOIS CORRIDAS: public.users contains security, moderation, legal and rating
-- state. RLS limits the row, but a table-level UPDATE grant still allowed a user
-- to rewrite every column in their own row. Keep only explicitly editable
-- profile fields available to authenticated clients; privileged fields remain
-- server-side only.

revoke insert, update, delete, truncate, references, trigger
  on table public.users
  from anon, authenticated;

-- Anonymous clients do not need direct access to mobility profiles. Signup is
-- provisioned by the SECURITY DEFINER auth_user_profile trigger.
revoke select on table public.users from anon;

-- Authenticated clients may read only rows allowed by RLS and may update the
-- harmless profile fields below. Security/moderation/rating/legal columns are
-- intentionally absent from this grant.
grant select on table public.users to authenticated;
grant update (name, phone, avatar_url, city, birth_date, gender, preferences, updated_at)
  on table public.users
  to authenticated;

-- Ensure self-service policy is tied to auth_user_id (the Auth UUID), not the
-- independent mobility profile id.
drop policy if exists "users_update_own" on public.users;
create policy "users_update_own"
on public.users
for update
to authenticated
using (auth_user_id = auth.uid())
with check (auth_user_id = auth.uid());

drop policy if exists "users_read_own" on public.users;
create policy "users_read_own"
on public.users
for select
to authenticated
using (auth_user_id = auth.uid());
