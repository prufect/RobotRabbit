import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'migrations/20260606190000_create-agentrabbit-backend.sql';

describe('AgentRabbit backend migration', () => {
  it('creates durable user-owned agent tables with InsForge auth references', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    for (const table of [
      'profiles',
      'repair_requests',
      'request_messages',
      'agent_jobs',
      'contractors',
      'contractor_notifications',
      'contractor_quotes',
    ]) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }

    expect(sql).toContain('references auth.users(id) on delete cascade');
    expect(sql).toContain('auth.uid()');
    expect(sql).toContain('id uuid primary key references auth.users(id) on delete cascade');
    expect(sql).toContain("create index if not exists idx_agent_jobs_due");
    expect(sql).toContain("create index if not exists idx_contractor_quotes_request");
  });

  it('adds request status, job status, notification status, and quote policies', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    for (const policyName of [
      'profiles_select_own',
      'repair_requests_select_own',
      'request_messages_select_own',
      'agent_jobs_select_own',
      'contractor_notifications_select_own',
      'contractor_quotes_select_own',
    ]) {
      expect(sql).toContain(`policy ${policyName}`);
    }

    expect(sql).toContain("status text not null default 'uploaded'");
    expect(sql).toContain("'pending_approval'");
    expect(sql).toContain("'booked'");
    expect(sql).toContain("job_type text not null");
    expect(sql).toContain("raw_message text not null");
    expect(sql).toContain("best_quote_id uuid references public.contractor_quotes(id)");
    expect(sql).toContain("approval_status text not null default 'pending'");
    expect(sql).toContain("approved_at timestamptz");
    expect(sql).toContain("rejected_at timestamptz");
    expect(sql).toContain("idx_contractor_quotes_approval");
    expect(sql).toContain("reply_received_at timestamptz");
    expect(sql).toContain("reply_message_id text");
    expect(sql).toContain("reply_body text");
  });
});
