-- APOIS CORRIDAS — CANONICAL BASELINE 003
-- Deny-by-default through RLS; explicit minimum policies below.

-- Mobility identity/profile
create policy users_read_own on public.users for select to authenticated using (auth_user_id=auth.uid());
create policy users_update_own on public.users for update to authenticated using (auth_user_id=auth.uid()) with check (auth_user_id=auth.uid());
create policy users_admin_read on public.users for select to authenticated using (private.has_permission('users.manage'));

create policy user_roles_read_own on public.user_roles for select to authenticated using (user_id=public.mobility_user_id());
create policy user_roles_admin_read on public.user_roles for select to authenticated using (private.has_permission('users.manage'));

create policy profiles_read_self_or_admin on public.profiles for select to authenticated
  using (auth.uid()=user_id or private.has_permission('users.manage'));
create policy profiles_admin_update on public.profiles for update to authenticated
  using (private.has_permission('users.manage')) with check (private.has_permission('users.manage'));
create policy permissions_authenticated_read on public.role_permissions for select to authenticated
  using (private.has_permission('admin.access'));

-- Driver private profile and admin review
create policy drivers_read_own_profile on public.drivers for select to authenticated using (user_id=public.mobility_user_id());
create policy drivers_admin_read on public.drivers for select to authenticated using (private.has_permission('users.manage'));
create policy drivers_admin_update on public.drivers for update to authenticated
  using (private.has_permission('users.manage')) with check (private.has_permission('users.manage'));
create policy admin_driver_notes_admin_all on public.admin_driver_notes for all to authenticated
  using (private.has_permission('users.manage')) with check (private.has_permission('users.manage'));

-- Rides: passenger sees own; driver sees only a real offer or own assigned ride; admin sees via permission.
create policy rides_passenger_read_own on public.rides for select to authenticated using (passenger_id=public.mobility_user_id());
create policy rides_driver_read_relevant on public.rides for select to authenticated using (
  public.mobility_user_id()=any(candidate_driver_ids)
  or exists(
    select 1 from public.drivers d
    where d.user_id=public.mobility_user_id()
      and (d.id=rides.driver_id or d.id=rides.accepted_driver_id)
  )
);
create policy rides_admin_read on public.rides for select to authenticated using (private.has_permission('users.manage'));

create policy ride_categories_authenticated_read on public.ride_categories for select to authenticated using (is_active);
create policy tariff_rules_authenticated_read on public.tariff_rules for select to authenticated using (is_active);
create policy payment_methods_authenticated_read on public.payment_methods for select to authenticated using (is_active);

-- Wallet/payment surfaces
create policy passenger_wallet_read_own on public.passenger_wallets for select to authenticated using (passenger_id=public.mobility_user_id());
create policy cancellation_fees_passenger_read_own on public.cancellation_fees for select to authenticated using (passenger_id=public.mobility_user_id());
create policy driver_wallets_read_own on public.driver_wallets for select to authenticated using (
  exists(select 1 from public.drivers d where d.id=driver_wallets.driver_id and d.user_id=public.mobility_user_id())
);
create policy driver_wallet_transactions_read_own on public.driver_wallet_transactions for select to authenticated using (
  exists(select 1 from public.drivers d where d.id=driver_wallet_transactions.driver_id and d.user_id=public.mobility_user_id())
);
create policy driver_withdrawals_read_own on public.driver_withdrawals for select to authenticated using (
  exists(select 1 from public.drivers d where d.id=driver_withdrawals.driver_id and d.user_id=public.mobility_user_id())
);
create policy payment_webhook_receipts_no_client_access on public.payment_webhook_receipts for all to anon,authenticated
  using (false) with check (false);
create policy app_settings_backend_only on public.app_settings for all to authenticated using (false) with check (false);

-- Notifications
create policy notifications_manage_own on public.notifications for select to authenticated using (user_id=public.mobility_user_id());
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id=public.mobility_user_id()) with check (user_id=public.mobility_user_id());
create policy notifications_delete_own on public.notifications for delete to authenticated using (user_id=public.mobility_user_id());
create policy notification_logs_read_own on public.notification_logs for select to authenticated using (user_id=public.mobility_user_id());
create policy notification_preferences_manage_own on public.user_notification_preferences for all to authenticated
  using (user_id=public.mobility_user_id()) with check (user_id=public.mobility_user_id());
create policy notification_tokens_manage_own on public.user_notification_tokens for all to authenticated
  using (user_id=public.mobility_user_id()) with check (user_id=public.mobility_user_id());

-- Safety/support
create policy emergency_contacts_manage_own on public.passenger_emergency_contacts for all to authenticated
  using (passenger_id=public.mobility_user_id()) with check (passenger_id=public.mobility_user_id());
create policy driver_emergency_contacts_own_all on public.driver_emergency_contacts for all to authenticated using (
  exists(select 1 from public.drivers d where d.id=driver_emergency_contacts.driver_id and d.user_id=public.mobility_user_id())
) with check (
  exists(select 1 from public.drivers d where d.id=driver_emergency_contacts.driver_id and d.user_id=public.mobility_user_id())
);
create policy sos_alerts_read_own on public.sos_alerts for select to authenticated using (user_id=public.mobility_user_id());
create policy sos_alerts_insert_own on public.sos_alerts for insert to authenticated with check (
  user_id=public.mobility_user_id()
  and (driver_id is null or exists(select 1 from public.drivers d where d.id=sos_alerts.driver_id and d.user_id=public.mobility_user_id()))
);
create policy support_tickets_read_own on public.passenger_support_tickets for select to authenticated using (passenger_id=public.mobility_user_id());
create policy account_deletion_requests_read_own on public.account_deletion_requests for select to authenticated using (user_id=public.mobility_user_id());

-- Admin/CMS RBAC
create policy audit_staff_read on public.audit_logs for select to authenticated using (private.has_permission('audit.read'));

create policy content_public_read on public.content_documents for select to anon using (
  status='published' and (scheduled_at is null or scheduled_at<=now()) and (published_at is null or published_at<=now())
);
create policy content_staff_read on public.content_documents for select to authenticated using (private.has_permission('content.read'));
create policy content_staff_insert on public.content_documents for insert to authenticated with check (
  private.has_permission('content.write') and (status<>'published' or private.has_permission('content.publish'))
);
create policy content_staff_update on public.content_documents for update to authenticated
  using (private.has_permission('content.write'))
  with check (private.has_permission('content.write') and (status<>'published' or private.has_permission('content.publish')));
create policy content_admin_delete on public.content_documents for delete to authenticated using (private.has_permission('content.delete'));
create policy versions_staff_read on public.content_versions for select to authenticated using (private.has_permission('content.read'));

create policy forms_public_insert on public.form_submissions for insert to anon,authenticated with check (status='new' and assigned_to is null);
create policy forms_staff_read on public.form_submissions for select to authenticated using (private.has_permission('forms.read'));
create policy forms_staff_update on public.form_submissions for update to authenticated
  using (private.has_permission('forms.write')) with check (private.has_permission('forms.write'));

create policy media_public_read on public.media_assets for select to anon using (status='published' and bucket='public-media');
create policy media_staff_read on public.media_assets for select to authenticated using (private.has_permission('media.read'));
create policy media_staff_insert on public.media_assets for insert to authenticated with check (private.has_permission('media.write') and owner_id=auth.uid());
create policy media_staff_update on public.media_assets for update to authenticated
  using (private.has_permission('media.write')) with check (private.has_permission('media.write'));
create policy media_admin_delete on public.media_assets for delete to authenticated using (private.has_permission('media.delete'));
