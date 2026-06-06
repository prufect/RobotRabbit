import express from 'express';
import { config, isSerperLive, isTwilioLive, isTelegramLive } from './config.js';
import { searchContractors } from './search.js';
import { notifyContractors } from './notify.js';

const app = express();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Conversation-Id');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Twilio webhooks post urlencoded

// In-memory store of contractor replies, keyed by phone. Track 1 can poll
// GET /api/responses to power CUJ 3 ("Book Now") without a DB dependency.
const responses = [];

// ── Phone → conversationId mapping ──────────────────────────────────────────
// Populated when POST /api/notify-contractors is called (Track 2 sends
// X-Conversation-Id header). Used to route inbound Twilio webhook replies
// back to the correct Track 2 negotiation session.
const phoneToConversation = new Map();

// ── Phone → contractor name mapping ─────────────────────────────────────────
const phoneToName = new Map();

// --- Health / status --------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    track: 'integrations',
    mode: {
      mockMode: config.mockMode,
      serper: isSerperLive() ? 'live' : 'mock',
      twilio: isTwilioLive() ? 'live' : 'mock',
      telegram: isTelegramLive() ? 'live' : 'mock',
    },
  });
});

// --- POST /api/search-contractors ------------------------------------------
// Contract: { searchQuery, location?, limit? } -> { status, results[] }
app.post('/api/search-contractors', async (req, res) => {
  const { searchQuery, location, limit } = req.body || {};
  if (!searchQuery) {
    return res.status(400).json({ status: 'error', message: 'searchQuery is required' });
  }
  try {
    const { results, source } = await searchContractors(
      searchQuery,
      location || config.defaultLocation,
      Number(limit) || 3
    );
    return res.json({ status: 'success', source, results });
  } catch (err) {
    console.error('[/api/search-contractors] error:', err);
    return res.status(500).json({ status: 'error', message: err.message, results: [] });
  }
});

// --- POST /api/notify-contractors ------------------------------------------
// Contract: { contractors[], issueDetails{} } -> { status, notifiedCount, errors[] }
app.post('/api/notify-contractors', async (req, res) => {
  const { contractors, issueDetails } = req.body || {};
  if (!Array.isArray(contractors) || contractors.length === 0) {
    return res.status(400).json({ status: 'error', message: 'contractors[] is required' });
  }

  // Store conversationId → phone mapping so we can route Twilio replies back
  const conversationId = req.headers['x-conversation-id'] || '';
  if (conversationId) {
    for (const c of contractors) {
      if (c.phone) {
        phoneToConversation.set(c.phone, conversationId);
        phoneToName.set(c.phone, c.name || 'Unknown Contractor');
      }
    }
    console.log(`[notify] Mapped ${contractors.length} phones → conversationId: ${conversationId}`);
  }

  try {
    const { notifiedCount, results, errors } = await notifyContractors(
      contractors,
      issueDetails || {}
    );
    return res.json({ status: 'success', notifiedCount, results, errors });
  } catch (err) {
    console.error('[/api/notify-contractors] error:', err);
    return res.status(500).json({ status: 'error', message: err.message, notifiedCount: 0, errors: [] });
  }
});

// --- Twilio inbound webhook (CUJ 3: contractor replies) --------------------
// Configure this URL in the Twilio sandbox "When a message comes in" setting.
// Twilio posts urlencoded fields: From, Body, etc.
app.post('/webhooks/twilio', async (req, res) => {
  const from = (req.body.From || '').replace('whatsapp:', '');
  const body = req.body.Body || '';
  const available = /\byes\b/i.test(body);
  const feeMatch = body.match(/\$\s?(\d+(?:\.\d{1,2})?)/);

  const reply = {
    phone: from,
    body,
    available,
    quote: feeMatch ? Number(feeMatch[1]) : null,
    receivedAt: new Date().toISOString(),
  };
  responses.unshift(reply);
  console.log('[webhook] contractor reply:', reply);

  // ── Forward to Track 2's /api/contractor-reply ──────────────────────────
  const conversationId = phoneToConversation.get(from);
  const contractorName = phoneToName.get(from) || 'Unknown';

  if (conversationId && config.track2BaseUrl) {
    try {
      const forwardRes = await fetch(`${config.track2BaseUrl}/api/contractor-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          contractorPhone: from,
          contractorName: contractorName,
          messageBody: body,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      const data = await forwardRes.json().catch(() => ({}));
      console.log(`[webhook] Forwarded to Track 2: ${data.action ?? 'unknown'} (${data.quotesReceived ?? '?'}/${data.quotesNeeded ?? '?'})`);
    } catch (err) {
      console.error(`[webhook] Failed to forward to Track 2:`, err.message);
    }
  } else if (!conversationId) {
    console.warn(`[webhook] No conversationId mapped for phone ${from} — reply not forwarded to Track 2.`);
  } else if (!config.track2BaseUrl) {
    console.warn(`[webhook] TRACK2_BASE_URL not set — reply not forwarded.`);
  }

  // Reply back to the contractor with a TwiML acknowledgement.
  res.set('Content-Type', 'text/xml');
  res.send(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${
      available ? 'Thanks! The homeowner has been notified. 🎉' : 'Thanks for the update.'
    }</Message></Response>`
  );
});

// Track 1 polls this to surface quotes in the UI.
app.get('/api/responses', (_req, res) => {
  res.json({ status: 'success', responses });
});

app.listen(config.port, () => {
  console.log(`Track 3 Integrations service listening on :${config.port}`);
  console.log(
    `Modes -> serper:${isSerperLive() ? 'live' : 'mock'} ` +
      `twilio:${isTwilioLive() ? 'live' : 'mock'} ` +
      `telegram:${isTelegramLive() ? 'live' : 'mock'}` +
      (config.mockMode ? ' (MOCK_MODE forced)' : '')
  );
  if (config.track2BaseUrl) {
    console.log(`Track 2 forwarding: ${config.track2BaseUrl}/api/contractor-reply`);
  } else {
    console.warn('TRACK2_BASE_URL not set — contractor replies will NOT be forwarded to Track 2.');
  }
});

export default app;
