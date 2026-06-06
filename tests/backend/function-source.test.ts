import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const functionFiles = [
  'functions/analyze.ts',
  'functions/search-contractors.ts',
  'functions/notify-contractors.ts',
  'functions/contractor-reply.ts',
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
});
