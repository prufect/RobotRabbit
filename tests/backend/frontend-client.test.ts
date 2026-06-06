import { existsSync, readFileSync } from 'node:fs';
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

  it('ships a browser adapter for the deployed frontend flow', async () => {
    const servicePath = 'frontend/services/insforgeApi.js';

    expect(existsSync(servicePath), 'frontend/services/insforgeApi.js should exist').toBe(true);
    if (!existsSync(servicePath)) return;

    const source = readFileSync(servicePath, 'utf8');
    expect(source).toMatch(/storage\s*\.\s*from\('repair-photos'\)/);
    expect(source).toContain("database.from('repair_requests')");
    expect(source).toContain('image_url: upload.data.url');
    expect(source).toContain('image_key: upload.data.key');
    expect(source).toContain("functions.invoke('analyze'");
    expect(source).toContain("functions.invoke('search-contractors'");
    expect(source).toContain("functions.invoke('notify-contractors'");
    expect(source).toContain("functions.invoke('status'");
  });

  it('uses the real InsForge adapter from the Vercel frontend entrypoint', () => {
    const source = readFileSync('frontend/app.js', 'utf8');

    expect(source).toContain("./services/insforgeApi.js");
    expect(source).not.toContain("./services/mockApi.js");
  });
});
