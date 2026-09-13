-- SOLO ACTIVACIÓN MANUAL. Ejecute como propietario DESPUÉS de la migración, el despliegue y la primera sincronización.
-- Primero habilite pg_cron y pg_net en Database > Extensions y confirme que Vault
-- esté disponible. Cree estos nombres ÚNICOS de Vault desde el panel:
-- timezone_project_url: la URL HTTPS de su proyecto, sin barra final
-- timezone_publishable_key: su clave pública sb_publishable_ (enrutamiento de la puerta de enlace)
-- timezone_sync_secret: el valor privado exacto de TIMEZONE_SYNC_SECRET en Edge Secrets
-- No incluya ningún secreto, URL ni identificador real de proyecto en este archivo.
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

-- Volver a ejecutarlo reemplaza solo la tarea con este nombre; no puede acumular programaciones duplicadas.
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
