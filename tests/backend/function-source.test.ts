import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const functionFiles = [
  'functions/analyze.ts',
  'functions/search-contractors.ts',
  'functions/notify-contractors.ts',
  'functions/contractor-reply.ts',
  'functions/telegram-webhook.ts',
  'functions/finalize-booking.ts',
  'functions/status.ts',
  'functions/process-agent-jobs.ts',
];

describe('InsForge edge function sources', () => {
  it('exports flat function slugs with CORS handling', () => {
    for (const file of functionFiles) {
      const source = readFileSync(file, 'utf8');

      expect(source).toContain('export default async function');
      expect(source).toMatch(/req\.method === 'OPTIONS'|requirePost\(req\)/);
      expect(source).toMatch(/corsHeaders|requirePost|optionsResponse/);
    }
  });

  it('authenticates user-facing functions with edgeFunctionToken', () => {
    for (const file of ['functions/analyze.ts', 'functions/status.ts']) {
      const source = readFileSync(file, 'utf8');

      expect(source).toContain("import { createClient } from 'npm:@insforge/sdk'");
      expect(source).toContain('edgeFunctionToken');
      expect(source).toContain('auth.getCurrentUser()');
    }
  });

  it('routes Telegram replies through the shared quote approval intake', () => {
    const source = readFileSync('functions/telegram-webhook.ts', 'utf8');

    expect(source).toContain("from './_shared/contractor-replies.ts'");
    expect(source).toContain('recordContractorReply');
    expect(source).toContain("source: 'telegram'");
    expect(source).toContain('reply_received_at');
    expect(source).toContain('reply_message_id');
    expect(source).toContain("approvalStatus: 'pending'");
  });

  it('does not schedule contractor notifications during search', () => {
    const source = readFileSync('functions/search-contractors.ts', 'utf8');

    expect(source).not.toContain("job_type: 'notify_contractors'");
    expect(source).not.toContain("payload: { contractorIds }");
  });

  it('requires exactly one selected contractor for outbound notifications', () => {
    const source = readFileSync('functions/notify-contractors.ts', 'utf8');

    expect(source).toContain('selectedContractor');
    expect(source).toContain('Select exactly one contractor to notify');
    expect(source).toContain('contractorIds.length !== 1');
    expect(source).toContain('selectedContractorId');
  });

  it('marks selected contractor quotes as approved when booking is finalized', () => {
    const source = readFileSync('functions/finalize-booking.ts', 'utf8');

    expect(source).toContain("approval_status: 'approved'");
    expect(source).toContain('approved_at: now');
    expect(source).toContain("approval_status: 'rejected'");
    expect(source).toContain('rejected_at: now');
    expect(source).toContain("status: 'booked'");
  });

  it('returns pending approvals from status for frontend polling', () => {
    const source = readFileSync('functions/status.ts', 'utf8');

    expect(source).toContain('pendingApprovals');
    expect(source).toContain("approval_status === 'pending'");
    expect(source).toContain('approvalSummary');
  });
});
