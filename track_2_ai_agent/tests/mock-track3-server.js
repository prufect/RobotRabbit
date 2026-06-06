/**
 * Mock Track 3 Server — simulates the Integrations backend.
 *
 * Runs on port 3001 and provides:
 *  - POST /api/search-contractors  → returns 3 mock contractors
 *  - POST /api/notify-contractors  → logs the outgoing messages, then auto-fires
 *    contractor replies back to Track 2's /api/contractor-reply after a delay
 *
 * This lets you test the FULL end-to-end CUJ without any real Twilio/WhatsApp.
 */

import express from 'express';

const app = express();
app.use(express.json());

const TRACK2_URL = process.env.TRACK2_URL || 'http://localhost:3002';

// ─── Mock contractor database ────────────────────────────────────────────────

const CONTRACTORS = [
  { name: "Bob's Quick HVAC",   phone: '+14155550101', rating: 4.8 },
  { name: 'SF Carrier Experts', phone: '+14155550202', rating: 4.5 },
  { name: 'Bay Area Fix-It',    phone: '+14155550303', rating: 4.7 },
];

// Simulated contractor replies (what they'd text back via WhatsApp)
const SIMULATED_REPLIES = [
  { delay: 3000, phone: '+14155550101', name: "Bob's Quick HVAC",   msg: "Yes, available in 1 hour. $150 call-out fee. Can have it fixed same day." },
  { delay: 5000, phone: '+14155550202', name: 'SF Carrier Experts', msg: "We can come out in about 2 hours. Our rate is $120 for the call-out plus parts. We're certified dealers." },
  { delay: 8000, phone: '+14155550303', name: 'Bay Area Fix-It',    msg: "Hi! I can squeeze you in tomorrow morning, around 9 AM. $180 flat rate including diagnosis." },
];

// ─── POST /api/search-contractors ────────────────────────────────────────────

app.post('/api/search-contractors', (req, res) => {
  const { searchQuery, location, limit } = req.body;

  console.log(`\n🔍 [Track 3] Searching contractors for "${searchQuery}" in ${location} (limit: ${limit})`);

  const results = CONTRACTORS.slice(0, limit || 3);
  results.forEach((c, i) => {
    console.log(`   ${i + 1}. ${c.name} (${c.phone}) ⭐ ${c.rating}`);
  });

  res.json({ status: 'success', results });
});

// ─── POST /api/notify-contractors ────────────────────────────────────────────

app.post('/api/notify-contractors', (req, res) => {
  const { contractors, issueDetails } = req.body;

  console.log(`\n📱 [Track 3] Sending WhatsApp messages to ${contractors.length} contractors:`);
  contractors.forEach((c, i) => {
    console.log(`   ${i + 1}. ${c.name} (${c.phone})`);
  });
  console.log(`   Issue: ${issueDetails.brand} ${issueDetails.model} (${issueDetails.category})`);
  console.log(`   Urgency: ${issueDetails.urgency}`);
  console.log(`   Image: ${issueDetails.imageUrl}`);

  res.json({ status: 'success', notifiedCount: contractors.length, errors: [] });

  // ── Simulate contractor replies coming back after delays ───────────────
  // In production, Twilio/Telegram webhooks would forward replies.
  // Here we simulate it by calling Track 2's /api/contractor-reply after a delay.

  const conversationId = req.headers['x-conversation-id'] || 'unknown';

  console.log(`\n⏳ [Track 3] Simulating contractor replies (will arrive over next 8 seconds)...`);

  SIMULATED_REPLIES.forEach(({ delay, phone, name, msg }) => {
    setTimeout(async () => {
      console.log(`\n💬 [Track 3] Contractor "${name}" replied: "${msg.substring(0, 50)}..."`);
      console.log(`   → Forwarding to Track 2 POST /api/contractor-reply`);

      try {
        const response = await fetch(`${TRACK2_URL}/api/contractor-reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId,
            contractorPhone: phone,
            contractorName: name,
            messageBody: msg,
          }),
        });

        const data = await response.json();

        if (data.readyForUser) {
          console.log(`\n🎉 ═══════════════════════════════════════════════════`);
          console.log(`   NEGOTIATION COMPLETE!`);
          console.log(`   Best Quote: ${data.bestQuote.contractorName}`);
          console.log(`   Price: $${data.bestQuote.price}`);
          console.log(`   Availability: ${data.bestQuote.availability}`);
          console.log(`   Message to User: "${data.messageToUser}"`);
          console.log(`═══════════════════════════════════════════════════════\n`);
        } else {
          console.log(`   ✓ Quote recorded (${data.quotesReceived}/${data.quotesNeeded})`);
        }
      } catch (err) {
        console.error(`   ✗ Failed to forward reply: ${err.message}`);
      }
    }, delay);
  });
});

// ─── Health Check ────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'mock-track-3', version: '1.0.0' });
});

// ─── Start ───────────────────────────────────────────────────────────────────

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`\n🔌 Mock Track 3 (Integrations) running on http://localhost:${PORT}`);
  console.log(`   Endpoints:`);
  console.log(`   - POST /api/search-contractors`);
  console.log(`   - POST /api/notify-contractors`);
  console.log(`   - GET  /api/health`);
  console.log(`\n   Contractor replies will be simulated automatically.\n`);
});
