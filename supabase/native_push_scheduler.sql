create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pgcrypto with schema extensions;

create or replace function public.dispatch_native_notifications()
returns void language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  endpoint text;
  dispatch_secret text;
  issued_at text;
  nonce text;
  request_token text;
begin
  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'native_push_dispatch_url' limit 1;
  select decrypted_secret into dispatch_secret from vault.decrypted_secrets where name = 'native_push_dispatch_secret' limit 1;
  if endpoint is null or dispatch_secret is null then return; end if;
  issued_at := floor(extract(epoch from clock_timestamp()))::bigint::text;
  nonce := gen_random_uuid()::text;
  request_token := 'v1.' || issued_at || '.' || nonce || '.' || encode(
    extensions.hmac('native-push-dispatch:' || issued_at || ':' || nonce, dispatch_secret, 'sha256'), 'hex');
  perform net.http_post(
    url := endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || request_token),
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
