// Deterministic mock contractors used when SerpApi has no key / fails.
// Phone numbers are Twilio "magic" test-friendly placeholders — swap with the
// real numbers of your stage volunteers (who've joined the WhatsApp sandbox).

const CATALOG = {
  hvac: [
    { name: "Bob's Quick HVAC", phone: '+14155550101', rating: 4.8 },
    { name: 'SF Carrier Experts', phone: '+14155550202', rating: 4.6 },
    { name: 'Bay Area Cooling Co.', phone: '+14155550303', rating: 4.4 },
  ],
  electrical: [
    { name: 'Sparky & Sons Electric', phone: '+14155550404', rating: 4.9 },
    { name: 'Golden Gate Electricians', phone: '+14155550505', rating: 4.5 },
    { name: 'Square D Certified Pros', phone: '+14155550606', rating: 4.3 },
  ],
  plumbing: [
    { name: 'Pacific Plumbing', phone: '+14155550707', rating: 4.7 },
    { name: 'Mission Drain Masters', phone: '+14155550808', rating: 4.4 },
  ],
  default: [
    { name: 'All-Fix Home Services', phone: '+14155550909', rating: 4.6 },
    { name: 'City Repair Collective', phone: '+14155551010', rating: 4.5 },
    { name: 'Reliable Handy Pros', phone: '+14155551111', rating: 4.2 },
  ],
};

function categoryFromQuery(query = '') {
  const q = query.toLowerCase();
  if (q.includes('hvac') || q.includes('air condition') || q.includes('ac ') || q.includes('carrier') || q.includes('furnace')) return 'hvac';
  if (q.includes('electric') || q.includes('panel') || q.includes('breaker')) return 'electrical';
  if (q.includes('plumb') || q.includes('drain') || q.includes('water') || q.includes('pipe')) return 'plumbing';
  return 'default';
}

export function mockContractors(query, limit = 3) {
  const cat = categoryFromQuery(query);
  return (CATALOG[cat] || CATALOG.default).slice(0, limit);
}
