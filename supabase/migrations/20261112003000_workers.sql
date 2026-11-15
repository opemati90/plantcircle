-- Background workers on a real Supabase project.
--
-- 1. The service role gets exactly what the edge functions use. Since Supabase's 2026 grant
--    change, new tables are not granted to any API role automatically, the service role
--    included; bypassing RLS does not bypass SQL privileges. Nothing else is granted to it.
-- 2. Reminders run inside the database every 15 minutes (pg_cron), so there is no public URL to
--    call for them. Push delivery needs Expo's API, so pg_cron calls the push-dispatch function
--    every minute with the service-role key read from Vault. The function refuses any other key.
--    Until the owner stores `plantcircle_project_url` and `plantcircle_service_role_key` in Vault,
--    the push job does nothing.
--
-- Both parts are skipped where the roles or extensions do not exist (the local test database).

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage on schema public to service_role;
    grant select, delete on public.push_tokens to service_role;
    grant select on public.user_settings to service_role;
    grant select on public.push_queue to service_role;
    grant update (sent_at) on public.push_queue to service_role;
    grant execute on function
      public.push_queue_claim(integer),
      public.notifications_enqueue_due_and_cleanup(),
      public.web_rsvp_rate_check(text, integer),
      public.guest_plan_open(uuid),
      public.auth_user_id_by_email(text),
      public.guest_rsvp_join(uuid, uuid, text, text, uuid),
      public.guest_rsvp_cancel(uuid, uuid)
    to service_role;
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    return;
  end if;
  create extension if not exists pg_cron;
  create extension if not exists pg_net with schema extensions;

  -- Re-running the migration replaces the jobs rather than adding copies.
  perform cron.unschedule(jobname) from cron.job
  where jobname in ('plantcircle-reminders', 'plantcircle-push-dispatch');

  perform cron.schedule(
    'plantcircle-reminders',
    '*/15 * * * *',
    'select public.notifications_enqueue_due_and_cleanup()');

  perform cron.schedule(
    'plantcircle-push-dispatch',
    '* * * * *',
    $job$
      select net.http_post(
        url := s.url || '/functions/v1/push-dispatch',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || s.key),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000)
      from (
        select
          (select decrypted_secret from vault.decrypted_secrets
            where name = 'plantcircle_project_url') as url,
          (select decrypted_secret from vault.decrypted_secrets
            where name = 'plantcircle_service_role_key') as key
      ) s
      where s.url is not null and s.key is not null
    $job$);
end;
$$;
