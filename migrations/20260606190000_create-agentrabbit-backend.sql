create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contractors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  website text,
  category text not null,
  location_text text,
  source text not null,
  source_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.contractor_quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  contractor_id uuid references public.contractors(id) on delete set null,
  contractor_name text not null,
  contractor_phone text,
  available boolean not null default true,
  price numeric,
  availability text,
  raw_message text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.repair_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'uploaded' check (
    status in (
      'uploaded',
      'needs_info',
      'identified',
      'searching',
      'notifying',
      'negotiating',
      'completed',
      'failed'
    )
  ),
  category text,
  brand text,
  urgency text not null default 'normal' check (
    urgency in ('low', 'normal', 'medium', 'high', 'emergency')
  ),
  location_text text,
  image_url text not null,
  image_key text not null,
  model_name text,
  diagnosis text,
  next_question text,
  best_quote_id uuid references public.contractor_quotes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.contractor_quotes
  add constraint contractor_quotes_request_id_fkey
  foreign key (request_id) references public.repair_requests(id) on delete cascade;

create table if not exists public.request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.repair_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  message_type text not null check (
    message_type in ('text', 'image', 'analysis', 'search', 'notification', 'quote', 'error')
  ),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.repair_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  job_type text not null check (job_type in ('analyze_image', 'search_contractors', 'notify_contractors')),
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0,
  last_error text,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contractor_notifications (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.repair_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  contractor_id uuid references public.contractors(id) on delete set null,
  channel text not null check (channel in ('whatsapp', 'telegram', 'mock')),
  destination text,
  status text not null check (status in ('pending', 'sent', 'failed', 'mock_sent')),
  message text not null,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_repair_requests_user_created
  on public.repair_requests(user_id, created_at desc);
create index if not exists idx_request_messages_request_created
  on public.request_messages(request_id, created_at);
create index if not exists idx_agent_jobs_due
  on public.agent_jobs(status, run_after, created_at);
create index if not exists idx_agent_jobs_request
  on public.agent_jobs(request_id);
create index if not exists idx_contractors_lookup
  on public.contractors(category, location_text, source);
create index if not exists idx_contractor_notifications_request
  on public.contractor_notifications(request_id, created_at);
create index if not exists idx_contractor_quotes_request
  on public.contractor_quotes(request_id, created_at);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function system.update_updated_at();

drop trigger if exists repair_requests_set_updated_at on public.repair_requests;
create trigger repair_requests_set_updated_at
  before update on public.repair_requests
  for each row execute function system.update_updated_at();

drop trigger if exists agent_jobs_set_updated_at on public.agent_jobs;
create trigger agent_jobs_set_updated_at
  before update on public.agent_jobs
  for each row execute function system.update_updated_at();

drop trigger if exists contractor_notifications_set_updated_at on public.contractor_notifications;
create trigger contractor_notifications_set_updated_at
  before update on public.contractor_notifications
  for each row execute function system.update_updated_at();

drop trigger if exists contractor_quotes_set_updated_at on public.contractor_quotes;
create trigger contractor_quotes_set_updated_at
  before update on public.contractor_quotes
  for each row execute function system.update_updated_at();

alter table public.profiles enable row level security;
alter table public.repair_requests enable row level security;
alter table public.request_messages enable row level security;
alter table public.agent_jobs enable row level security;
alter table public.contractors enable row level security;
alter table public.contractor_notifications enable row level security;
alter table public.contractor_quotes enable row level security;

create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());
create policy profiles_insert_own on public.profiles
  for insert with check (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy repair_requests_select_own on public.repair_requests
  for select using (user_id = auth.uid());
create policy repair_requests_insert_own on public.repair_requests
  for insert with check (user_id = auth.uid());
create policy repair_requests_update_own on public.repair_requests
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy request_messages_select_own on public.request_messages
  for select using (user_id = auth.uid());
create policy request_messages_insert_own on public.request_messages
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.repair_requests rr
      where rr.id = request_id and rr.user_id = auth.uid()
    )
  );

create policy agent_jobs_select_own on public.agent_jobs
  for select using (user_id = auth.uid());
create policy agent_jobs_insert_own on public.agent_jobs
  for insert with check (user_id = auth.uid());
create policy agent_jobs_update_own on public.agent_jobs
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy contractors_select_authenticated on public.contractors
  for select using (auth.uid() is not null);
create policy contractors_insert_authenticated on public.contractors
  for insert with check (auth.uid() is not null);

create policy contractor_notifications_select_own on public.contractor_notifications
  for select using (user_id = auth.uid());
create policy contractor_notifications_insert_own on public.contractor_notifications
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.repair_requests rr
      where rr.id = request_id and rr.user_id = auth.uid()
    )
  );
create policy contractor_notifications_update_own on public.contractor_notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy contractor_quotes_select_own on public.contractor_quotes
  for select using (user_id = auth.uid());
create policy contractor_quotes_insert_own on public.contractor_quotes
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.repair_requests rr
      where rr.id = request_id and rr.user_id = auth.uid()
    )
  );
create policy contractor_quotes_update_own on public.contractor_quotes
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
