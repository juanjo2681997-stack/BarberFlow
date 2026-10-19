create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create or replace function public.dispatch_native_notifications()
returns void language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  endpoint text;
  dispatch_secret text;
begin
  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'native_push_dispatch_url' limit 1;
  select decrypted_secret into dispatch_secret from vault.decrypted_secrets where name = 'native_push_dispatch_secret' limit 1;
  if endpoint is null or dispatch_secret is null then return; end if;
  perform net.http_post(
    url := endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || dispatch_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;
revoke all on function public.dispatch_native_notifications() from public, anon, authenticated;
grant execute on function public.dispatch_native_notifications() to service_role;

create or replace function public.wake_native_notifications()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists(select 1 from inserted_jobs where due_at <= now()) then
    perform public.dispatch_native_notifications();
  end if;
  return null;
end;
$$;
revoke all on function public.wake_native_notifications() from public, anon, authenticated;
drop trigger if exists wake_native_notifications on public.appointment_notification_jobs;
create trigger wake_native_notifications after insert on public.appointment_notification_jobs
  referencing new table as inserted_jobs for each statement execute function public.wake_native_notifications();

select cron.schedule('flowbarber-native-notifications', '* * * * *',
  'select public.dispatch_native_notifications()');
