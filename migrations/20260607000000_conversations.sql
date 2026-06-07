-- ============================================================
-- Migration: conversations & conversation_messages
-- Date: 2026-06-07
-- Description: Adds unified conversation threading for
--   homeowner ↔ contractor messaging.
-- ============================================================

-- ----------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contractor_id uuid references public.contractors(id) on delete set null,
  contractor_name text not null,
  contractor_phone text,
  latest_request_id uuid references public.repair_requests(id) on delete set null,
  status text not null default 'active' check (status in ('active','archived')),
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  unread_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  request_id uuid references public.repair_requests(id) on delete set null,
  direction text not null check (direction in ('inbound','outbound')),
  channel text not null default 'insforge',
  kind text not null default 'text',
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------
-- 2. Indexes
-- ----------------------------------------------------------

create unique index if not exists idx_conversations_user_contractor
  on public.conversations(user_id, contractor_id);

create index if not exists idx_conversations_user_last_message
  on public.conversations(user_id, last_message_at desc);

create index if not exists idx_conversation_messages_conv_created
  on public.conversation_messages(conversation_id, created_at);

-- ----------------------------------------------------------
-- 3. Updated_at trigger
-- ----------------------------------------------------------

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function system.update_updated_at();

-- ----------------------------------------------------------
-- 4. Row-level security
-- ----------------------------------------------------------

alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;

-- conversations: select / insert / update own rows
create policy conversations_select_own on public.conversations
  for select using (user_id = auth.uid());

create policy conversations_insert_own on public.conversations
  for insert with check (user_id = auth.uid());

create policy conversations_update_own on public.conversations
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- conversation_messages: select / insert own (via parent conversation)
create policy conversation_messages_select_own on public.conversation_messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

create policy conversation_messages_insert_own on public.conversation_messages
  for insert with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );
