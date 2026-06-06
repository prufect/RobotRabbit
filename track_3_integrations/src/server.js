import express from 'express';
import { config, isSerperLive, isTwilioLive, isTelegramLive } from './config.js';
import { searchContractors } from './search.js';
import { notifyContractors } from './notify.js';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Twilio webhooks post urlencoded

// In-memory store of contractor replies, keyed by phone. Track 1 can poll
// GET /api/responses to power CUJ 3 ("Book Now") without a DB dependency.
const responses = [];

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
// Configure this URL (ngrok during dev) in the Twilio sandbox "When a message
// comes in" setting. Twilio posts urlencoded fields: From, Body, etc.
app.post('/webhooks/twilio', (req, res) => {
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
});

export { app };
