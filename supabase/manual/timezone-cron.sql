-- MANUAL ACTIVATION ONLY. Run as owner AFTER migration, deployment and first sync.
-- First enable pg_cron and pg_net under Database > Extensions, and confirm Vault
-- is available. Create these UNIQUE Vault names through the dashboard:
-- timezone_project_url: your project HTTPS URL, without a trailing slash
-- timezone_publishable_key: your public sb_publishable_ key (gateway routing)
-- timezone_sync_secret: the exact private TIMEZONE_SYNC_SECRET in Edge Secrets
-- No actual secret, URL, or project identifier belongs in this file.
begin;
do $$
begin
  if (select count(*) from vault.decrypted_secrets
      where name in ('timezone_project_url','timezone_publishable_key','timezone_sync_secret')) <> 3 then
    raise exception 'Create the three named Vault entries before scheduling';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'timezone_project_url'
      and decrypted_secret ~ '^https://[a-z0-9.-]+$')
    or not exists (select 1 from vault.decrypted_secrets where name = 'timezone_publishable_key'
      and decrypted_secret like 'sb_publishable_%')
    or not exists (select 1 from vault.decrypted_secrets where name = 'timezone_sync_secret'
      and length(decrypted_secret) between 32 and 256) then
    raise exception 'Invalid timezone Vault configuration';
  end if;
end;
$$;

-- Rerunning replaces this named job only; it cannot accumulate duplicate schedules.
select cron.unschedule(jobid) from cron.job where jobname = 'timezone-iana-daily';
select cron.schedule('timezone-iana-daily', '15 3 * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'timezone_project_url')
      || '/functions/v1/timezone-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'timezone_publishable_key'),
      'x-timezone-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'timezone_sync_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);
commit;
