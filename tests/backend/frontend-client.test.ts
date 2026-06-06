import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('frontend InsForge integration helper', () => {
  it('stores both storage URL and key before invoking the analyze function', () => {
    const source = readFileSync('track_1_frontend/insforgeAgentClient.ts', 'utf8');

    expect(source).toMatch(/storage\s*\.\s*from\('repair-photos'\)/);
    expect(source).toContain('image_url: upload.data.url');
    expect(source).toContain('image_key: upload.data.key');
    expect(source).toContain("functions.invoke('analyze'");
    expect(source).toContain('.insert([');
  });
});
