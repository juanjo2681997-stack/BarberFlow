begin;

create table public.native_push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id uuid not null unique,
  token text not null unique check (length(token) between 20 and 4096),
  platform text not null default 'android' check (platform = 'android'),
  updated_at timestamptz not null default now()
);
create index on public.native_push_devices(user_id);
alter table public.native_push_devices enable row level security;
revoke all on public.native_push_devices from anon, authenticated;
grant all on public.native_push_devices to service_role;

alter table public.appointments add column notification_revision bigint not null default 1;

create table public.appointment_notification_jobs (
  id uuid primary key default gen_random_uuid(),
  appointment_id text not null,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null,
  kind text not null check (kind in ('confirmed', 'modified', 'cancelled', 'reminder')),
  payload jsonb not null,
  due_at timestamptz not null,
  expires_at timestamptz not null,
  state text not null default 'pending' check (state in ('pending', 'processing', 'sent', 'cancelled', 'failed')),
  attempts integer not null default 0,
  lease_id uuid,
  lease_until timestamptz,
  delivered_devices uuid[] not null default '{}',
  last_error text,
  created_at timestamptz not null default now(),
  unique(appointment_id, recipient_id, revision, kind)
);
create index on public.appointment_notification_jobs(state, due_at);
alter table public.appointment_notification_jobs enable row level security;
revoke all on public.appointment_notification_jobs from anon, authenticated;
grant all on public.appointment_notification_jobs to service_role;

create function public.register_native_push_device(device_token text, installation uuid, owner_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(installation::text, 0));
  delete from public.native_push_devices
    where (installation_id = installation and token <> device_token)
       or (token = device_token and user_id <> owner_id);
  insert into public.native_push_devices(user_id, installation_id, token)
  values(owner_id, installation, device_token)
  on conflict(token) do update set user_id = excluded.user_id,
    installation_id = excluded.installation_id, updated_at = now();
end;
$$;

create function public.appointment_notification_version()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    new.notification_revision := 1;
  elsif row(new.appointment_date, new.appointment_time, new.service, new.status,
      new.appointment_status, new.customer_user_id, new.business_id)
      is distinct from row(old.appointment_date, old.appointment_time, old.service, old.status,
      old.appointment_status, old.customer_user_id, old.business_id) then
    new.notification_revision := old.notification_revision + 1;
  else
    new.notification_revision := old.notification_revision;
  end if;
  if coalesce(new.status, '') in ('cancelled', 'completed', 'no_show')
      or coalesce(new.appointment_status, '') in ('cancelled', 'completed', 'no_show') then
    new.reminder_status := 'failed';
    new.reminder_sent_at := null;
    new.reminder_error := 'Cita inactiva: recordatorio anulado';
  elsif tg_op = 'UPDATE' and new.notification_revision <> old.notification_revision then
    new.reminder_status := 'pending';
    new.reminder_sent_at := null;
    new.reminder_error := null;
  end if;
  return new;
end;
$$;
create trigger appointment_notification_version before insert or update on public.appointments
  for each row execute function public.appointment_notification_version();

create function public.queue_appointment_notifications()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  snapshot jsonb;
  revision_number bigint;
  appointment_start timestamptz;
  active_booking boolean;
  was_active boolean := false;
  event_kind text;
  shop_name text;
  barber_id uuid;
begin
  if tg_op = 'UPDATE' and new.notification_revision = old.notification_revision then return new; end if;
  if tg_op = 'DELETE' then
    snapshot := to_jsonb(old) || '{"deleted":true}'::jsonb;
    revision_number := old.notification_revision + 1;
  else
    snapshot := to_jsonb(new);
    revision_number := new.notification_revision;
  end if;
  update public.appointment_notification_jobs set state = 'cancelled', lease_id = null, lease_until = null
    where appointment_id = snapshot->>'id' and state in ('pending', 'processing');
  if snapshot->>'customer_user_id' is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  appointment_start := ((snapshot->>'appointment_date')::date +
    (snapshot->>'appointment_time')::time) at time zone 'Europe/Madrid';
  active_booking := coalesce(snapshot->>'status', '') not in ('cancelled', 'completed', 'no_show')
    and coalesce(snapshot->>'appointment_status', '') not in ('cancelled', 'completed', 'no_show')
    and tg_op <> 'DELETE';
  if tg_op <> 'INSERT' then
    was_active := coalesce(old.status, '') not in ('cancelled', 'completed', 'no_show')
      and coalesce(old.appointment_status, '') not in ('cancelled', 'completed', 'no_show');
  end if;
  select business_name into shop_name from public.business_settings
    where business_id::text = snapshot->>'business_id' limit 1;
  snapshot := jsonb_build_object(
    'date', snapshot->>'appointment_date', 'time', left(snapshot->>'appointment_time', 5),
    'service', snapshot->>'service', 'businessName', coalesce(nullif(shop_name, ''), 'FlowBarber'),
    'deleted', tg_op = 'DELETE'
  );
  if tg_op = 'DELETE' then
    if was_active then event_kind := 'cancelled'; end if;
  elsif (new.status = 'cancelled' or new.appointment_status = 'cancelled') and was_active then
    event_kind := 'cancelled';
  elsif active_booking and tg_op = 'INSERT' then
    event_kind := 'confirmed';
  elsif active_booking and tg_op = 'UPDATE' then
    if row(new.appointment_date, new.appointment_time, new.service)
        is distinct from row(old.appointment_date, old.appointment_time, old.service) or not was_active then
      event_kind := 'modified';
    end if;
  end if;
  if event_kind is not null then
    insert into public.appointment_notification_jobs(
      appointment_id, recipient_id, revision, kind, payload, due_at, expires_at)
    values(case when tg_op = 'DELETE' then old.id::text else new.id::text end,
      case when tg_op = 'DELETE' then old.customer_user_id else new.customer_user_id end,
      revision_number, event_kind, snapshot, now(), now() + interval '24 hours');
  end if;
  if active_booking and appointment_start - interval '24 hours' > now() then
    insert into public.appointment_notification_jobs(
      appointment_id, recipient_id, revision, kind, payload, due_at, expires_at)
    values(new.id::text, new.customer_user_id, revision_number, 'reminder', snapshot,
      appointment_start - interval '24 hours', appointment_start);
  end if;
  if tg_op = 'UPDATE' and event_kind = 'cancelled'
      and new.cancellation_reason = 'Cancelada por el cliente' then
    for barber_id in
      select distinct recipient.id from public.business_users membership
      join auth.users recipient on recipient.id = membership.user_id
        or (membership.user_id is null and lower(recipient.email) = lower(membership.email))
      left join public.employees employee on employee.id = membership.employee_id
        and employee.business_id = membership.business_id
      where membership.business_id = new.business_id and membership.role in ('owner', 'manager')
        and (membership.employee_id is null or (employee.is_active and employee.login_enabled))
        and recipient.id <> new.customer_user_id
    loop
      insert into public.appointment_notification_jobs(
        appointment_id, recipient_id, revision, kind, payload, due_at, expires_at)
      values(new.id::text, barber_id, revision_number, 'cancelled',
        snapshot || '{"audience":"barber"}'::jsonb, now(), now() + interval '24 hours');
    end loop;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
create trigger queue_appointment_notifications after insert or update or delete on public.appointments
  for each row execute function public.queue_appointment_notifications();

create function public.claim_appointment_notifications(batch_size integer default 20)
returns setof public.appointment_notification_jobs
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.appointment_notification_jobs set state = 'cancelled', lease_id = null
    where state in ('pending', 'processing') and expires_at <= now();
  update public.appointment_notification_jobs set state = 'failed', lease_id = null
    where state = 'processing' and lease_until < now() and attempts >= 8;
  return query
  with candidates as (
    select id from public.appointment_notification_jobs
    where due_at <= now() and expires_at > now() and attempts < 8
      and (state = 'pending' or (state = 'processing' and lease_until < now()))
    order by due_at for update skip locked limit greatest(1, least(batch_size, 50))
  )
  update public.appointment_notification_jobs jobs set state = 'processing',
    attempts = attempts + 1, lease_id = gen_random_uuid(), lease_until = now() + interval '2 minutes'
    from candidates where jobs.id = candidates.id returning jobs.*;
end;
$$;

create function public.notification_is_current(job_id uuid, claim_id uuid)
returns boolean language sql security definer set search_path = public, pg_temp as $$
  select exists(
    select 1 from public.appointment_notification_jobs jobs
    where jobs.id = job_id and jobs.lease_id = claim_id and jobs.state = 'processing'
      and jobs.lease_until > now() and jobs.expires_at > now()
      and (
        (jobs.kind = 'cancelled' and jobs.payload->>'deleted' = 'true'
          and not exists(select 1 from public.appointments where id::text = jobs.appointment_id))
        or exists(select 1 from public.appointments booking
          where booking.id::text = jobs.appointment_id
            and (booking.customer_user_id = jobs.recipient_id or (
              jobs.payload->>'audience' = 'barber' and exists(
                select 1 from public.business_users membership
                join auth.users recipient on recipient.id = membership.user_id
                  or (membership.user_id is null and lower(recipient.email) = lower(membership.email))
                left join public.employees employee on employee.id = membership.employee_id
                  and employee.business_id = membership.business_id
                where membership.business_id = booking.business_id and recipient.id = jobs.recipient_id
                  and membership.role in ('owner', 'manager')
                  and (membership.employee_id is null or (employee.is_active and employee.login_enabled))
              )
            ))
            and booking.notification_revision = jobs.revision
            and (jobs.kind <> 'reminder' or (
              coalesce(booking.status, '') not in ('cancelled', 'completed', 'no_show')
              and coalesce(booking.appointment_status, '') not in ('cancelled', 'completed', 'no_show')
            )))
      )
  );
$$;

create function public.record_notification_delivery(job_id uuid, claim_id uuid, device_id uuid)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.appointment_notification_jobs
    set delivered_devices = array_append(delivered_devices, device_id)
    where id = job_id and lease_id = claim_id and state = 'processing'
      and not device_id = any(delivered_devices);
$$;

create function public.finish_appointment_notification(job_id uuid, claim_id uuid, result_state text, error_code text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if result_state not in ('sent', 'pending', 'cancelled') then raise exception 'Invalid result'; end if;
  update public.appointment_notification_jobs set
    state = case when result_state = 'pending' and attempts >= 8 then 'failed' else result_state end,
    due_at = case when result_state = 'pending' then now() + least(3600, 30 * power(2, attempts)::integer) * interval '1 second' else due_at end,
    last_error = left(error_code, 100), lease_id = null, lease_until = null
    where id = job_id and lease_id = claim_id and state = 'processing';
end;
$$;

revoke all on function public.register_native_push_device(text, uuid, uuid),
  public.appointment_notification_version(), public.queue_appointment_notifications(),
  public.claim_appointment_notifications(integer), public.notification_is_current(uuid, uuid),
  public.record_notification_delivery(uuid, uuid, uuid),
  public.finish_appointment_notification(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.register_native_push_device(text, uuid, uuid),
  public.claim_appointment_notifications(integer), public.notification_is_current(uuid, uuid),
  public.record_notification_delivery(uuid, uuid, uuid),
  public.finish_appointment_notification(uuid, uuid, text, text) to service_role;

insert into public.appointment_notification_jobs(
  appointment_id, recipient_id, revision, kind, payload, due_at, expires_at)
select booking.id::text, booking.customer_user_id, booking.notification_revision, 'reminder',
  jsonb_build_object('date', booking.appointment_date, 'time', left(booking.appointment_time::text, 5),
    'service', booking.service, 'businessName', coalesce(
      (select nullif(business_name, '') from public.business_settings where business_id = booking.business_id limit 1),
      'FlowBarber'), 'deleted', false),
  (booking.appointment_date::date + booking.appointment_time::time) at time zone 'Europe/Madrid' - interval '24 hours',
  (booking.appointment_date::date + booking.appointment_time::time) at time zone 'Europe/Madrid'
from public.appointments booking
where booking.customer_user_id is not null
  and coalesce(booking.status, '') not in ('cancelled', 'completed', 'no_show')
  and coalesce(booking.appointment_status, '') not in ('cancelled', 'completed', 'no_show')
  and ((booking.appointment_date::date + booking.appointment_time::time) at time zone 'Europe/Madrid') > now() + interval '24 hours'
on conflict do nothing;

commit;
