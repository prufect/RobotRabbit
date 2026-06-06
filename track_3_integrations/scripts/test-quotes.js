// In-process test of the quote engine + booking endpoints.
// Run with MOCK_MODE so no real messages fire:
//   MOCK_MODE=true node scripts/test-quotes.js
import '../src/server.js'; // boots app.listen on config.port
import { config } from '../src/config.js';
import { rankQuotes, parseReply } from '../src/quotes.js';

const base = `http://localhost:${config.port}`;
const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
const form = (p, kv) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(kv) }).then((r) => r.text());
const get = (p) => fetch(base + p).then((r) => r.json());

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT FAILED: ' + msg);
  console.log('  ✓ ' + msg);
}

async function main() {
  await new Promise((r) => setTimeout(r, 300)); // let listener bind

  console.log('Unit: parseReply');
  const p = parseReply('Yes! $150, can be there in 1 hour');
  assert(p.available && p.quote === 150 && p.etaMinutes === 60, `parsed ${JSON.stringify(p)}`);

  console.log('\n1) notify 3 contractors');
  const n = await post('/api/notify-contractors', {
    contractors: [
      { name: 'Bob HVAC', phone: '+14155550101' },
      { name: 'SF Carrier', phone: '+14155550202' },
      { name: 'Bay Cooling', phone: '+14155550303' },
    ],
    issueDetails: { category: 'hvac', brand: 'Carrier', model: 'Infinity 26', urgency: 'high' },
  });
  assert(n.notifiedCount === 3, `notifiedCount=${n.notifiedCount}`);

  console.log('\n2) simulate replies');
  await form('/webhooks/twilio', { From: 'whatsapp:+14155550101', Body: 'YES, $200, there in 2 hours' });
  await form('/webhooks/twilio', { From: 'whatsapp:+14155550202', Body: 'Yes! $150, can be there in 1 hour' });
  await form('/webhooks/twilio', { From: 'whatsapp:+14155550303', Body: 'Sorry, not available' });
  console.log('  3 replies posted');

  console.log('\n3) best-quote (expect SF Carrier $150)');
  const bq = await get('/api/best-quote');
  assert(bq.best?.phone === '+14155550202' && bq.best?.quote === 150, `best=${bq.best?.name} $${bq.best?.quote}`);
  assert(bq.ranked.length === 2, `ranked ${bq.ranked.length} available (declined one excluded)`);

  console.log('\n4) book the winner');
  const bk = await post('/api/book', { phone: '+14155550202' });
  assert(bk.status === 'success' && bk.booked.name === 'SF Carrier', `booked ${bk.booked?.name}`);
  assert(bk.declinedCount === 1, `declinedCount=${bk.declinedCount} (the other available bidder)`);

  console.log('\n✅ Quote engine + booking tests passed.');
  process.exit(0);
}

main().catch((e) => { console.error('\n❌', e); process.exit(1); });
