select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'appointments', 'business_settings', 'business_users', 'employees',
    'native_push_devices', 'appointment_notification_jobs'
  )
order by table_name, ordinal_position;

select name, installed_version
from pg_available_extensions
where name in ('pg_net', 'pg_cron', 'supabase_vault');

select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('native_push_devices', 'appointment_notification_jobs');

select trigger_name, event_manipulation, event_object_table
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in ('appointments', 'appointment_notification_jobs')
order by event_object_table, trigger_name;
