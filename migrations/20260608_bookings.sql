-- ============================================================
-- Migration: bookings table + conversations.negotiation_status
-- Date: 2026-06-08
-- Description: Adds a first-class bookings table with
--   human-readable booking numbers, cancel/reschedule support,
--   and a negotiation_status column on conversations.
-- ============================================================

-- ----------------------------------------------------------
-- 1. Bookings Table
-- ----------------------------------------------------------

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_number text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null references public.repair_requests(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  contractor_id uuid references public.contractors(id) on delete set null,
  quote_id uuid references public.contractor_quotes(id) on delete set null,
  contractor_name text not null,
  contractor_phone text,
  category text,
  price numeric,
  scheduled_date text not null,
  scheduled_time text not null,
  status text not null default 'upcoming'
    check (status in ('upcoming','completed','cancelled','rescheduled')),
  cancel_reason text,
  reschedule_note text,
  original_booking_id uuid references public.bookings(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------
-- 2. Add negotiation_status to conversations
-- ----------------------------------------------------------

alter table public.conversations
  add column if not exists negotiation_status text
    not null default 'active';

-- Add check constraint separately (idempotent with DO block)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'conversations_negotiation_status_check'
  ) then
    alter table public.conversations
      add constraint conversations_negotiation_status_check
      check (negotiation_status in ('active','pending_approval','booked','cancelled'));
  end if;
end$$;

-- ----------------------------------------------------------
-- 3. Indexes
-- ----------------------------------------------------------

create index if not exists idx_bookings_user_status
  on public.bookings(user_id, status);

create unique index if not exists idx_bookings_number
  on public.bookings(booking_number);

create index if not exists idx_bookings_request
  on public.bookings(request_id);

create index if not exists idx_conversations_negotiation_status
  on public.conversations(user_id, negotiation_status);

-- ----------------------------------------------------------
-- 4. Updated_at trigger
-- ----------------------------------------------------------

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function system.update_updated_at();

-- ----------------------------------------------------------
-- 5. Row-level security
-- ----------------------------------------------------------

alter table public.bookings enable row level security;

create policy bookings_select_own on public.bookings
  for select using (user_id = auth.uid());

create policy bookings_insert_own on public.bookings
  for insert with check (user_id = auth.uid());

create policy bookings_update_own on public.bookings
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ----------------------------------------------------------
-- 6. Booking number generation helper
-- ----------------------------------------------------------

-- Helper function to generate booking numbers: BK-YYYYMMDD-XXXX
create or replace function public.generate_booking_number()
returns text
language sql
as $$
  select 'BK-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 4))
$$;
