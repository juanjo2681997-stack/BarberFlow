-- FlowBarber account deletion requests
-- Execute the UP section in Supabase SQL Editor before testing the in-app flow.
-- The DOWN section at the bottom reverts this change if needed.

-- UP
create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  -- Stored without a foreign key to auth.users so the request can remain as an
  -- audit record after the auth account is eventually removed.
  user_id uuid not null,
  email text not null,
  status text not null default 'pending',
  request_source text not null default 'customer_app',
  confirmation_text text not null,
  metadata jsonb not null default '{}'::jsonb,
  admin_notes text,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint account_deletion_requests_status_check
    check (status in ('pending', 'processing', 'completed', 'cancelled', 'rejected')),
  constraint account_deletion_requests_source_check
    check (request_source in ('customer_app', 'barber_panel', 'public_email', 'admin'))
);

create unique index if not exists account_deletion_requests_one_active_per_user_idx
  on public.account_deletion_requests (user_id)
  where status in ('pending', 'processing');

create index if not exists account_deletion_requests_status_requested_at_idx
  on public.account_deletion_requests (status, requested_at desc);

create or replace function public.set_account_deletion_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_account_deletion_requests_updated_at
  on public.account_deletion_requests;

create trigger set_account_deletion_requests_updated_at
before update on public.account_deletion_requests
for each row
execute function public.set_account_deletion_requests_updated_at();

alter table public.account_deletion_requests enable row level security;

drop policy if exists "Users can read own account deletion requests"
  on public.account_deletion_requests;

create policy "Users can read own account deletion requests"
on public.account_deletion_requests
for select
to authenticated
using (auth.uid() = user_id);

-- No insert/update/delete policy is created intentionally.
-- Requests are created through /api/account-deletion/request with the service
-- role after resolving the authenticated user from the Supabase session.

-- DOWN
-- drop policy if exists "Users can read own account deletion requests"
--   on public.account_deletion_requests;
-- drop trigger if exists set_account_deletion_requests_updated_at
--   on public.account_deletion_requests;
-- drop function if exists public.set_account_deletion_requests_updated_at();
-- drop table if exists public.account_deletion_requests;
