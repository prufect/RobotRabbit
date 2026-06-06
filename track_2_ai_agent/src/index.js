/**
 * Track 2 — AI Agent for Home Maintenance.
 *
 * Entry point: creates the Express server, mounts routes, and starts listening.
 *
 * Routes:
 *   POST /api/analyze              — Image analysis (Gemini Vision)
 *   POST /api/contractor-reply     — Webhook for contractor quotes
 *   GET  /api/status/:conversationId — Session status
 *   GET  /api/health               — Health check
 */

// Load .env BEFORE any other import so config.js picks up env vars.
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import config from './config.js';
import { analyzeHandler } from './handlers/analyze.js';
import { analyzeTextHandler } from './handlers/analyzeText.js';
import { contractorReplyHandler } from './handlers/contractorReply.js';
import { statusHandler } from './handlers/status.js';
import { errorHandler } from './utils/errors.js';

// ─── App Setup ───────────────────────────────────────────────────────────────

const app = express();

// ── Global Middleware ────────────────────────────────────────────────────────

// Parse JSON bodies (limit to 25 MB to accommodate base64 image payloads if ever sent inline)
app.use(express.json({ limit: '25mb' }));

// Enable CORS for all origins (lock down in production)
app.use(cors());

// Attach a unique request ID to every incoming request for traceability.
app.use((req, _res, next) => {
  req.id = req.headers['x-request-id'] || uuidv4();
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    console.info(JSON.stringify({
      level: 'info',
      timestamp: new Date().toISOString(),
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
    }));
  });

  next();
});

// ── Routes ───────────────────────────────────────────────────────────────────

// Health check — returns 200 with service metadata.
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'track-2-ai-agent',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV,
    geminiModel: config.GEMINI_MODEL,
  });
});

app.post('/api/analyze', analyzeHandler);
app.post('/api/analyze-text', analyzeTextHandler);
app.post('/api/contractor-reply', contractorReplyHandler);
app.get('/api/status/:conversationId', statusHandler);

// ── 404 Catch-All ────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({
    status: 'error',
    code: 'NOT_FOUND',
    message: 'The requested endpoint does not exist.',
  });
});

// ── Error Handler (must be last) ─────────────────────────────────────────────

app.use(errorHandler);

// ── Start Server ─────────────────────────────────────────────────────────────

app.listen(config.PORT, () => {
  console.info(JSON.stringify({
    level: 'info',
    timestamp: new Date().toISOString(),
    message: `🏠 Track 2 AI Agent running on port ${config.PORT}`,
    environment: config.NODE_ENV,
    geminiModel: config.GEMINI_MODEL,
    track3Url: config.TRACK3_BASE_URL,
    minQuotes: config.MIN_QUOTES_REQUIRED,
  }));
});

// Export for testing with supertest
export default app;
