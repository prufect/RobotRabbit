// In-process test of the Message Center capture + conversation API.
//   MOCK_MODE=true node scripts/test-messages.js
import '../src/server.js';
import { config } from '../src/config.js';

const base = `http://localhost:${config.port}`;
const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
const form = (p, kv) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(kv) }).then((r) => r.text());
const get = (p) => fetch(base + p);

function assert(c, m) { if (!c) throw new Error('ASSERT FAILED: ' + m); console.log('  ✓ ' + m); }

async function main() {
  await new Promise((r) => setTimeout(r, 300));

  console.log('1) notify a plumber (outbound) with a requestId');
  await post('/api/notify-contractors', {
    requestId: 'req-demo-001',
    contractors: [{ name: 'Pacific Plumbing', phone: '+14155550707' }],
    issueDetails: { category: 'plumbing', brand: 'Kohler', model: 'water heater', urgency: 'high' },
  });

  console.log('2) plumber replies (inbound)');
  await form('/webhooks/twilio', { From: 'whatsapp:+14155550707', Body: 'YES, $120, there in 30 mins' });

  console.log('3) book them (outbound winner)');
  await post('/api/book', { phone: '+14155550707' });

  console.log('4) GET /api/conversations');
  const conv = await (await get('/api/conversations')).json();
  assert(conv.conversations.length === 1, `1 conversation, got ${conv.conversations.length}`);
  const c = conv.conversations[0];
  assert(c.name === 'Pacific Plumbing', `name=${c.name}`);
  const dirs = c.messages.map((m) => `${m.direction}:${m.kind}`);
  console.log('     thread:', dirs.join('  →  '));
  assert(c.messages.length === 3, `3 messages, got ${c.messages.length}`);
  assert(dirs[0] === 'outbound:outreach', 'first = outreach');
  assert(dirs[1] === 'inbound:reply', 'second = reply');
  assert(dirs[2] === 'outbound:booking', 'third = booking');
  assert(c.messages.every((m) => m.requestId === 'req-demo-001'), 'all tagged req-demo-001');

  console.log('5) GET /api/conversations/:phone');
  const one = await (await get('/api/conversations/+14155550707')).json();
  assert(one.messages.length === 3, `thread has 3 msgs`);

  console.log('6) Message Center UI page served');
  const page = await get('/messages.html');
  const html = await page.text();
  assert(page.status === 200 && /Message Center/.test(html), 'GET /messages.html -> 200');

  console.log('\n✅ Message Center tests passed.');
  process.exit(0);
}
main().catch((e) => { console.error('\n❌', e); process.exit(1); });
