alter table public.repair_requests
  drop constraint if exists repair_requests_status_check;

alter table public.repair_requests
  add constraint repair_requests_status_check
  check (
    status in (
      'uploaded',
      'needs_info',
      'identified',
      'searching',
      'notifying',
      'negotiating',
      'pending_approval',
      'completed',
      'booked',
      'failed'
    )
  );

alter table public.contractor_notifications
  drop constraint if exists contractor_notifications_status_check;

alter table public.contractor_notifications
  add constraint contractor_notifications_status_check
  check (status in ('pending', 'sent', 'failed', 'mock_sent', 'replied'));

alter table public.contractor_notifications
  add column if not exists reply_received_at timestamptz,
  add column if not exists reply_message_id text,
  add column if not exists reply_body text;

alter table public.contractor_quotes
  add column if not exists approval_status text not null default 'pending',
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists approval_metadata jsonb not null default '{}'::jsonb;

alter table public.contractor_quotes
  drop constraint if exists contractor_quotes_approval_status_check;

alter table public.contractor_quotes
  add constraint contractor_quotes_approval_status_check
  check (approval_status in ('pending', 'approved', 'rejected'));

create index if not exists idx_contractor_quotes_approval
  on public.contractor_quotes(request_id, approval_status, created_at desc);
