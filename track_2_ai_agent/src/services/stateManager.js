/**
 * In-memory state manager for conversation / negotiation sessions.
 *
 * Each session is keyed by `conversationId` and tracks the full lifecycle:
 * image analysis → contractor search → negotiation → completion.
 *
 * NOTE: This is intentionally in-memory for the hackathon.  In production
 * you would swap this for Redis or a database-backed store.
 */

/** @typedef {'IMAGE_ANALYSIS'|'SEARCHING_CONTRACTORS'|'NEGOTIATING'|'COMPLETED'|'FAILED'} SessionStatus */

/** @type {Map<string, object>} */
const sessions = new Map();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function now() {
  return new Date().toISOString();
}

/**
 * Parse an availability string into a rough number of minutes for comparison.
 * Lower is better. Returns Infinity when we can't parse.
 *
 * @param {string|null} availability
 * @returns {number}
 */
function availabilityToMinutes(availability) {
  if (!availability) return Infinity;
  const lower = availability.toLowerCase();

  // Try extracting a number
  const numMatch = lower.match(/(\d+(?:\.\d+)?)/);
  const num = numMatch ? parseFloat(numMatch[1]) : Infinity;

  if (lower.includes('min'))   return num;
  if (lower.includes('hour'))  return num * 60;
  if (lower.includes('day'))   return num * 1440;
  if (lower.includes('tomorrow')) return 24 * 60;

  // Fallback: just return the extracted number as minutes
  return num;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Create a new session.
 * @param {string} conversationId
 * @param {object} data — { userId, urgency, imageUrl }
 * @returns {object} The created session.
 */
export function createSession(conversationId, data) {
  const session = {
    conversationId,
    userId: data.userId,
    urgency: data.urgency ?? 'normal',
    status: /** @type {SessionStatus} */ ('IMAGE_ANALYSIS'),
    issueDetails: {
      category: null,
      brand: null,
      modelNumber: null,
      imageUrl: data.imageUrl ?? null,
    },
    contractors: [],
    quotes: [],
    bestQuote: null,
    createdAt: now(),
    updatedAt: now(),
  };
  sessions.set(conversationId, session);
  return session;
}

/**
 * Retrieve a session by conversationId.
 * @param {string} conversationId
 * @returns {object|undefined}
 */
export function getSession(conversationId) {
  return sessions.get(conversationId);
}

/**
 * Merge partial updates into an existing session.
 * @param {string} conversationId
 * @param {object} updates
 * @returns {object} The updated session.
 */
export function updateSession(conversationId, updates) {
  const session = sessions.get(conversationId);
  if (!session) {
    throw new Error(`Session not found: ${conversationId}`);
  }

  // Deep-merge issueDetails if present
  if (updates.issueDetails) {
    Object.assign(session.issueDetails, updates.issueDetails);
    delete updates.issueDetails;
  }

  Object.assign(session, updates, { updatedAt: now() });
  return session;
}

/**
 * Append a parsed quote to the session's quotes array.
 * Deduplicates by contractorPhone — a second reply from the same phone
 * overwrites the previous quote.
 *
 * @param {string} conversationId
 * @param {object} quote — { contractorName, contractorPhone, available, price, availability, rawMessage }
 * @returns {object} The updated session.
 */
export function addQuote(conversationId, quote) {
  const session = sessions.get(conversationId);
  if (!session) {
    throw new Error(`Session not found: ${conversationId}`);
  }

  // Deduplicate by phone number
  const idx = session.quotes.findIndex(q => q.contractorPhone === quote.contractorPhone);
  if (idx !== -1) {
    session.quotes[idx] = { ...session.quotes[idx], ...quote, updatedAt: now() };
  } else {
    session.quotes.push({ ...quote, receivedAt: now() });
  }

  session.updatedAt = now();
  return session;
}

/**
 * Select the best quote from the current session.
 *
 * Scoring: lower price is better; faster availability breaks ties.
 * Quotes where `available === false` are excluded.
 *
 * @param {string} conversationId
 * @returns {object|null} The best quote, or null if none are viable.
 */
export function getBestQuote(conversationId) {
  const session = sessions.get(conversationId);
  if (!session) return null;

  const viable = session.quotes.filter(q => q.available !== false);
  if (viable.length === 0) return null;

  viable.sort((a, b) => {
    const priceDiff = (a.price ?? Infinity) - (b.price ?? Infinity);
    if (priceDiff !== 0) return priceDiff;
    return availabilityToMinutes(a.availability) - availabilityToMinutes(b.availability);
  });

  const best = viable[0];
  session.bestQuote = best;
  session.updatedAt = now();
  return best;
}

/**
 * Return all active sessions (for debugging / admin).
 * @returns {object[]}
 */
export function getAllSessions() {
  return Array.from(sessions.values());
}

/**
 * Delete a session.
 * @param {string} conversationId
 * @returns {boolean} true if a session was deleted.
 */
export function deleteSession(conversationId) {
  return sessions.delete(conversationId);
}
