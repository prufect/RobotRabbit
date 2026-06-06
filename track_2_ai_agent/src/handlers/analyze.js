/**
 * POST /api/analyze — Image analysis endpoint.
 *
 * Accepts a photo URL of a broken appliance, identifies it via Gemini Vision,
 * and if successful, kicks off the contractor search + notification pipeline
 * via Track 3's APIs.
 */

import config from '../config.js';
import { analyzeImage } from '../services/gemini.js';
import * as state from '../services/stateManager.js';
import { validateAnalyzeRequest } from '../utils/validation.js';
import { ValidationError, GeminiError } from '../utils/errors.js';
import { MOCK_CONTRACTORS } from '../mocks/contractors.js';

/**
 * Call Track 3's POST /api/search-contractors.
 * Falls back to mock data when Track 3 is unreachable.
 *
 * @param {string} searchQuery
 * @returns {Promise<object[]>} Array of contractor objects.
 */
async function searchContractors(searchQuery) {
  const url = `${config.TRACK3_BASE_URL}/api/search-contractors`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        searchQuery,
        location: 'San Francisco, CA',
        limit: config.MIN_QUOTES_REQUIRED,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) throw new Error(`Track 3 returned HTTP ${res.status}`);
    const data = await res.json();
    return data.results ?? [];
  } catch (err) {
    console.warn(JSON.stringify({
      level: 'warn',
      timestamp: new Date().toISOString(),
      message: 'Track 3 /api/search-contractors unreachable — using mock data.',
      error: err.message,
    }));
    return MOCK_CONTRACTORS;
  }
}

/**
 * Call Track 3's POST /api/notify-contractors.
 * Best-effort — failure here should not block the response.
 *
 * @param {object[]} contractors
 * @param {object}   issueDetails
 */
async function notifyContractors(contractors, issueDetails, conversationId) {
  const url = `${config.TRACK3_BASE_URL}/api/notify-contractors`;

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Conversation-Id': conversationId ?? '',
      },
      body: JSON.stringify({ contractors, issueDetails }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.warn(JSON.stringify({
      level: 'warn',
      timestamp: new Date().toISOString(),
      message: 'Track 3 /api/notify-contractors call failed — contractors may not have been notified.',
      error: err.message,
    }));
  }
}

/**
 * Express handler for POST /api/analyze.
 */
export async function analyzeHandler(req, res, next) {
  try {
    // ── Validate ─────────────────────────────────────────────────────────────
    const { valid, errors } = validateAnalyzeRequest(req.body);
    if (!valid) {
      throw new ValidationError('Invalid request body.', { errors });
    }

    const { conversationId, userId, imageUrl, urgency } = req.body;

    console.info(JSON.stringify({
      level: 'info',
      timestamp: new Date().toISOString(),
      requestId: req.id,
      message: 'Analyzing image',
      conversationId,
      imageUrl,
    }));

    // ── Create session ───────────────────────────────────────────────────────
    state.createSession(conversationId, { userId, urgency, imageUrl });

    // ── Call Gemini Vision ───────────────────────────────────────────────────
    const analysis = await analyzeImage(imageUrl);

    if (analysis.isIdentified) {
      // Update session with identified details
      state.updateSession(conversationId, {
        status: 'SEARCHING_CONTRACTORS',
        issueDetails: {
          category: analysis.category,
          brand: analysis.brand,
          modelNumber: analysis.modelNumber,
          imageUrl,
        },
      });

      // ── Search for contractors via Track 3 ─────────────────────────────────
      const contractors = await searchContractors(analysis.contractorSearchQuery);

      state.updateSession(conversationId, {
        status: 'NEGOTIATING',
        contractors,
      });

      // ── Notify contractors (fire-and-forget) ──────────────────────────────
      notifyContractors(contractors, {
        category: analysis.category,
        brand: analysis.brand,
        model: analysis.modelNumber,
        imageUrl,
        urgency: urgency ?? 'normal',
      }, conversationId);

      console.info(JSON.stringify({
        level: 'info',
        timestamp: new Date().toISOString(),
        requestId: req.id,
        message: 'Appliance identified — contractors notified.',
        conversationId,
        brand: analysis.brand,
        model: analysis.modelNumber,
        contractorsFound: contractors.length,
      }));
    } else {
      // Appliance not identified — stay in IMAGE_ANALYSIS, ask user for more info
      state.updateSession(conversationId, {
        status: 'IMAGE_ANALYSIS',
        issueDetails: {
          category: analysis.category ?? 'unknown',
        },
      });

      console.info(JSON.stringify({
        level: 'info',
        timestamp: new Date().toISOString(),
        requestId: req.id,
        message: 'Appliance not identified — requesting better photo.',
        conversationId,
      }));
    }

    // ── Return response matching API contract ────────────────────────────────
    return res.status(200).json({
      status: 'success',
      isIdentified: analysis.isIdentified,
      category: analysis.category ?? 'unknown',
      brand: analysis.brand ?? null,
      modelNumber: analysis.modelNumber ?? null,
      messageToUser: analysis.messageToUser,
      contractorSearchQuery: analysis.contractorSearchQuery ?? null,
    });
  } catch (err) {
    next(err);
  }
}
