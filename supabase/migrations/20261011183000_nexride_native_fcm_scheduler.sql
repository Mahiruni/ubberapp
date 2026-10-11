-- NexRide server-side native FCM outbox scheduler.
-- Runs independently of Rider/Driver WebView lifecycle, and unlike Vercel
-- Hobby cron supports timely delivery while Drivers are in the background.
-- Requires the encrypted Supabase Vault secret nexride_push_worker_token to
-- equal the Vercel NEXRIDE_PUSH_WORKER_SECRET on the deployed release.
-- No plaintext worker credentials are stored in this migration or cron.job.
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
      timeout_milliseconds := 8000
    );
  $worker$
);
