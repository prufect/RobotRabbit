// End-to-end smoke test of the Track 3 pipeline WITHOUT a running server.
// Exercises search -> notify in mock mode. Run: npm run test:smoke
import { searchContractors } from '../src/search.js';
import { notifyContractors } from '../src/notify.js';

async function main() {
  console.log('1) Searching contractors for "Carrier HVAC repair"...');
  const { results, source } = await searchContractors('Carrier HVAC repair', 'San Francisco, CA', 3);
  console.log(`   source=${source}, found ${results.length}:`);
  results.forEach((r) => console.log(`   - ${r.name} ${r.phone} (${r.rating})`));

  if (results.length === 0) throw new Error('Expected at least one contractor');

  console.log('\n2) Notifying contractors...');
  const issue = {
    category: 'hvac',
    brand: 'Carrier',
    model: 'Infinity 26',
    imageUrl: 'https://storage.insforge.com/bucket/img_123.jpg',
    urgency: 'high',
  };
  const out = await notifyContractors(results, issue);
  console.log(`   notifiedCount=${out.notifiedCount}, errors=${out.errors.length}`);
  out.results.forEach((r) => console.log(`   - ${r.name} via ${r.channel} ${r.id || ''}`));

  if (out.notifiedCount !== results.length) throw new Error('Not all contractors notified');
  console.log('\n✅ Smoke test passed.');
}

main().catch((e) => {
  console.error('\n❌ Smoke test failed:', e);
  process.exit(1);
});
