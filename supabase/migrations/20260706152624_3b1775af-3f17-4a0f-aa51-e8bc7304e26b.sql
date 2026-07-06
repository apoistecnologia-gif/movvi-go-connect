
SELECT cron.unschedule('renew-driver-subscriptions-daily');

SELECT cron.schedule(
  'renew-driver-subscriptions-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--0900bef2-57d2-47b9-93b1-0ea5defee501.lovable.app/api/public/hooks/renew-driver-subscriptions',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer Jn0d0pHqdh8oZ2UqvbA9mbBlIg3SvFD6lHz2w9HdwltD9E_PYnC7DVtSIfriRTkS"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
