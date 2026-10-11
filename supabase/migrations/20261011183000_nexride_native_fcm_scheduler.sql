-- NexRide server-side native FCM outbox scheduler.
-- Runs independently of Rider/Driver WebView lifecycle, and unlike Vercel
-- Hobby cron supports timely delivery while Drivers are in the background.
-- Requires the encrypted Supabase Vault secret nexride_push_worker_token to
-- equal the Vercel NEXRIDE_PUSH_WORKER_SECRET on the deployed release.
-- No plaintext worker credentials are stored in this migration or cron.job.
-- The job must be enabled only after deployment and Vault/Vercel secrets
-- are aligned and a protected worker invocation returns HTTP 200.
create extension if not exists pg_net with schema extensions;
select cron.schedule(
  'nexride-native-fcm-outbox-drain',
  '10 seconds',
  $worker$
    select net.http_get(
      url := 'https://ubberapp.vercel.app/api/internal/push-drain',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                       where name = 'nexride_push_worker_token')
      ),
      timeout_milliseconds := 15000
    )
    -- Run the inexpensive Postgres check every 10 seconds; only incur an
    -- outbound Vercel request when a retryable event is actually due.
    where exists (
      select 1 from public.nexride_push_outbox e
      where (e.status = 'pending' and e.retry_at <= now())
         or (e.status = 'processing' and e.claimed_at < now() - interval '2 minutes')
    );
  $worker$
);
