/**
 * Centralized configuration — reads from environment variables with sensible defaults.
 * Import `dotenv/config` at the entry-point (index.js) so .env values are available here.
 */

const config = Object.freeze({
  // ─── Gemini AI ──────────────────────────────────────────────────────────────
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? '',
  GEMINI_MODEL: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',

  // ─── Track 3 Integration ───────────────────────────────────────────────────
  TRACK3_BASE_URL: process.env.TRACK3_BASE_URL ?? 'http://localhost:3001',

  // ─── Server ────────────────────────────────────────────────────────────────
  PORT: parseInt(process.env.PORT, 10) || 3002,
  NODE_ENV: process.env.NODE_ENV ?? 'development',

  // ─── Business Rules ────────────────────────────────────────────────────────
  /** Minimum number of contractor quotes before we can select a winner. */
  MIN_QUOTES_REQUIRED: parseInt(process.env.MIN_QUOTES_REQUIRED, 10) || 3,

  /** How long (ms) to wait for contractor replies before timing out a session. */
  NEGOTIATION_TIMEOUT_MS: parseInt(process.env.NEGOTIATION_TIMEOUT_MS, 10) || 300_000,

  // ─── Image Constraints ─────────────────────────────────────────────────────
  MAX_IMAGE_SIZE_BYTES: 20 * 1024 * 1024, // 20 MB
  ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],

  // ─── Gemini Call Settings ──────────────────────────────────────────────────
  GEMINI_TIMEOUT_MS: parseInt(process.env.GEMINI_TIMEOUT_MS, 10) || 30_000,
  GEMINI_MAX_RETRIES: 1,
});

export default config;
