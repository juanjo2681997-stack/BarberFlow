begin;

create function public.appointment_barber_recipient(target_business_id uuid, target_employee_id uuid, target_barber_name text)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  with eligible as (
    select employee.* from public.employees employee
    where employee.business_id = target_business_id and employee.is_active
      and employee.login_enabled and (employee.id = target_employee_id or employee.receives_bookings)
      and employee.role in ('owner', 'manager', 'barber')
  ), named as (
    select * from eligible where lower(trim(display_name)) = lower(trim(target_barber_name))
  ), assigned as (
    select * from eligible where target_employee_id is not null and id = target_employee_id
    union all
    select * from named where target_employee_id is null and (select count(*) from named) = 1
    union all
    select * from eligible where target_employee_id is null
      and not exists(select 1 from named) and (select count(*) from eligible) = 1
  ), recipients as (
    select distinct recipient.id from assigned employee
    join public.business_users membership on membership.business_id = employee.business_id
      and (membership.employee_id = employee.id or (
        membership.employee_id is null and (
          membership.user_id = employee.user_id
          or lower(membership.email) = lower(employee.email)
        )
      ))
    join auth.users recipient on recipient.id = coalesce(employee.user_id, membership.user_id)
      or (employee.user_id is null and membership.user_id is null
        and lower(recipient.email) = lower(employee.email)
        and lower(recipient.email) = lower(membership.email))
    where membership.role in ('owner', 'manager', 'barber')
  )
  select id from recipients where (select count(*) from recipients) = 1;
$$;
revoke all on function public.appointment_barber_recipient(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.appointment_barber_recipient(uuid, uuid, text) to service_role;

create or replace function public.appointment_notification_version()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    new.notification_revision := 1;
  elsif row(new.appointment_date, new.appointment_time, new.service, new.status,
      new.appointment_status, new.customer_user_id, new.business_id, new.employee_id, new.barber_name)
      is distinct from row(old.appointment_date, old.appointment_time, old.service, old.status,
      old.appointment_status, old.customer_user_id, old.business_id, old.employee_id, old.barber_name) then
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

create or replace function public.queue_appointment_notifications()
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
    barber_id := public.appointment_barber_recipient(new.business_id, new.employee_id, new.barber_name);
    if barber_id is not null and barber_id <> new.customer_user_id then
      insert into public.appointment_notification_jobs(
        appointment_id, recipient_id, revision, kind, payload, due_at, expires_at)
      values(new.id::text, barber_id, revision_number, 'cancelled',
        snapshot || '{"audience":"barber"}'::jsonb, now(), now() + interval '24 hours');
    end if;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create or replace function public.notification_is_current(job_id uuid, claim_id uuid)
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
              jobs.payload->>'audience' = 'barber'
              and jobs.recipient_id = public.appointment_barber_recipient(
                booking.business_id, booking.employee_id, booking.barber_name)
            ))
            and booking.notification_revision = jobs.revision
            and (jobs.kind <> 'reminder' or (
              coalesce(booking.status, '') not in ('cancelled', 'completed', 'no_show')
              and coalesce(booking.appointment_status, '') not in ('cancelled', 'completed', 'no_show')
            )))
      )
  );
$$;

update public.appointment_notification_jobs jobs set state = 'cancelled', lease_id = null, lease_until = null
where jobs.payload->>'audience' = 'barber' and jobs.state in ('pending', 'processing')
  and not exists (
    select 1 from public.appointments booking where booking.id::text = jobs.appointment_id
      and jobs.recipient_id = public.appointment_barber_recipient(
        booking.business_id, booking.employee_id, booking.barber_name)
  );

commit;
