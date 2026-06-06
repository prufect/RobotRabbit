import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const requiredKeys = [
  'INSFORGE_BASE_URL',
  'INSFORGE_ANON_KEY',
  'OPENROUTER_API_KEY',
  'OPENROUTER_MODEL',
  'AGENT_INTERNAL_SECRET',
  'SERPAPI_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_WHATSAPP_FROM',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
];

describe('.env.example', () => {
  it('documents every backend variable without real secrets', () => {
    const file = readFileSync('.env.example', 'utf8');

    for (const key of requiredKeys) {
      expect(file).toContain(`${key}=`);
    }

    expect(file).not.toMatch(/ik_[A-Za-z0-9]+/);
    expect(file).not.toMatch(/uak_[A-Za-z0-9]+/);
    expect(file).not.toMatch(/sk-[A-Za-z0-9]+/);
    expect(file).not.toMatch(/xox[baprs]-/);
    expect(file).not.toMatch(/AC[a-f0-9]{32}/i);
  });
});
