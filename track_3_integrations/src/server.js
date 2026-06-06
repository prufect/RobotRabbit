import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config, isSerperLive, isTwilioLive, isTelegramLive, isDbLive } from './config.js';
import { searchContractors } from './search.js';
import { notifyContractors, deliver } from './notify.js';
import { parseReply, rankQuotes } from './quotes.js';
import { buildWinnerMessage, buildDeclineMessage } from './templates.js';
import { recordMessage, getConversations, getConversation } from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
// Serve the live Message Center UI at /messages (and its assets).
app.use(express.static(join(__dirname, '..', 'public')));

// In-memory store of contractor replies, keyed by phone. Track 1 can poll
// GET /api/responses to power CUJ 3 ("Book Now") without a DB dependency.
const responses = [];

// Registry of who we've contacted (phone -> {name}) plus the latest job context,
// so booking/decline messages can address contractors by name and reference the job.
const contractorsByPhone = new Map();
let lastIssue = {};

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
      database: isDbLive() ? 'postgres' : 'in-memory',
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
    // requestId ties all messages of one job together (Track 4 maintenance_requests.id).
    const requestId = req.body.requestId || req.body.conversationId || null;
    // Remember who we contacted + the job, for later booking/decline messaging.
    lastIssue = issueDetails || {};
    for (const c of contractors) {
      if (c.phone) contractorsByPhone.set(c.phone, { name: c.name, telegramChatId: c.telegramChatId, requestId });
    }
    const { notifiedCount, results, errors } = await notifyContractors(
      contractors,
      issueDetails || {},
      { locale: req.body.locale, requestId }
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
  const parsed = parseReply(body);
  const known = contractorsByPhone.get(from) || {};

  const reply = {
    phone: from,
    name: known.name || null,
    body,
    ...parsed, // available, quote, etaMinutes, etaText
    receivedAt: new Date().toISOString(),
  };
  // De-dupe: a contractor's latest reply replaces their previous one.
  const idx = responses.findIndex((r) => r.phone === from);
  if (idx !== -1) responses.splice(idx, 1);
  responses.unshift(reply);

  // Capture the inbound message into the Message Center.
  const channel = (req.body.From || '').startsWith('whatsapp:') ? 'whatsapp' : 'sms';
  recordMessage({
    requestId: known.requestId || null,
    phone: from,
    name: known.name || null,
    direction: 'inbound',
    channel,
    kind: 'reply',
    body,
  });
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
      parsed.available ? 'Thanks! The homeowner has been notified. 🎉' : 'Thanks for the update.'
    }</Message></Response>`
  );
});

// Track 1 polls this to surface quotes in the UI.
app.get('/api/responses', (_req, res) => {
  res.json({ status: 'success', responses });
});

// --- GET /api/best-quote ----------------------------------------------------
// Ranks available replies (cheapest first, soonest ETA breaks ties).
app.get('/api/best-quote', (_req, res) => {
  const { ranked, best } = rankQuotes(responses);
  res.json({ status: 'success', best, ranked });
});

// --- POST /api/book ---------------------------------------------------------
// Books the winning contractor: messages them "you got the job" and politely
// declines everyone else who replied. Body: { phone, locale? }
app.post('/api/book', async (req, res) => {
  const { phone, locale } = req.body || {};
  if (!phone) {
    return res.status(400).json({ status: 'error', message: 'phone is required' });
  }
  const winnerReply = responses.find((r) => r.phone === phone);
  if (!winnerReply) {
    return res.status(404).json({ status: 'error', message: `no reply on file for ${phone}` });
  }

  const winner = { phone, name: winnerReply.name, ...(contractorsByPhone.get(phone) || {}) };
  const losers = responses
    .filter((r) => r.phone !== phone && r.available)
    .map((r) => ({ phone: r.phone, name: r.name, ...(contractorsByPhone.get(r.phone) || {}) }));

  try {
    const reqId = contractorsByPhone.get(phone)?.requestId || null;
    const [winnerSend, ...loserSends] = await Promise.all([
      deliver(winner, (channel) => buildWinnerMessage(winner, lastIssue, { channel, locale }), {
        requestId: reqId,
        kind: 'booking',
      }),
      ...losers.map((l) =>
        deliver(l, (channel) => buildDeclineMessage(l, lastIssue, { channel, locale }), {
          requestId: contractorsByPhone.get(l.phone)?.requestId || null,
          kind: 'decline',
        })
      ),
    ]);

    return res.json({
      status: 'success',
      booked: { ...winner, quote: winnerReply.quote, eta: winnerReply.etaText, channel: winnerSend.channel },
      declinedCount: loserSends.length,
    });
  } catch (err) {
    console.error('[/api/book] error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// --- Message Center ---------------------------------------------------------
// Full conversation thread between the agent and contractors (both directions,
// all channels). Powers the message-center UI at /messages and Track 1.
app.get('/api/conversations', (_req, res) => {
  res.json({ status: 'success', conversations: getConversations() });
});

app.get('/api/conversations/:phone', (req, res) => {
  const messages = getConversation(req.params.phone);
  res.json({ status: 'success', phone: req.params.phone, messages });
});

app.listen(config.port, () => {
  console.log(`Track 3 Integrations service listening on :${config.port}`);
  console.log(`Message Center UI -> http://localhost:${config.port}/messages.html`);
  console.log(
    `Modes -> serper:${isSerperLive() ? 'live' : 'mock'} ` +
      `twilio:${isTwilioLive() ? 'live' : 'mock'} ` +
      `telegram:${isTelegramLive() ? 'live' : 'mock'} ` +
      `db:${isDbLive() ? 'postgres' : 'in-memory'}` +
      (config.mockMode ? ' (MOCK_MODE forced)' : '')
  );
  if (config.track2BaseUrl) {
    console.log(`Track 2 forwarding: ${config.track2BaseUrl}/api/contractor-reply`);
  } else {
    console.warn('TRACK2_BASE_URL not set — contractor replies will NOT be forwarded to Track 2.');
  }
});

export default app;
