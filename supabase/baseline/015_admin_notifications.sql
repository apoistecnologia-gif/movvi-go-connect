-- APOIS CORRIDAS — CANONICAL BASELINE 015
-- Phase 8 notifications: allow authorized Admin staff to inspect delivery logs.
-- Fresh-database baseline only. Do not execute ad-hoc on production.

create policy notification_logs_admin_read on public.notification_logs
for select to authenticated
using (private.has_permission('notifications.send') or private.has_permission('audit.read'));
