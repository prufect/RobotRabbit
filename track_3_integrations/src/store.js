import { randomUUID } from 'node:crypto';
import { config, isDbLive } from './config.js';

// ---------------------------------------------------------------------------
// Message Center store.
//
// Every message between the agent and a contractor (both directions, any
// channel) is recorded here. The in-memory log is always the source of truth
// for the live UI; if a Track 4 Postgres DATABASE_URL is configured we ALSO
// persist to the `messages` table (best-effort, never blocks the demo).
// ---------------------------------------------------------------------------

/** @typedef {{id:string, requestId:string|null, phone:string, name:string|null,
 *   direction:'outbound'|'inbound', channel:string, kind:string, body:string, at:string}} Message */

/** @type {Message[]} newest-first */
const messages = [];

/**
 * Record one message. Returns the stored row.
 * @param {Omit<Message,'id'|'at'>} msg
 */
export function recordMessage(msg) {
  const row = {
    id: randomUUID(),
    at: new Date().toISOString(),
    requestId: msg.requestId ?? null,
    name: msg.name ?? null,
    kind: msg.kind ?? 'message',
    ...msg,
  };
  messages.unshift(row);
  persist(row); // fire-and-forget
  return row;
}

/** Full thread for one contractor, oldest-first (chat order). */
export function getConversation(phone) {
  return messages
    .filter((m) => m.phone === phone)
    .slice()
    .sort((a, b) => new Date(a.at) - new Date(b.at));
}

/**
 * All conversations grouped by contractor, each with its ordered thread.
 * Groups are sorted by most-recent activity. Shaped for a chat-list UI.
 */
export function getConversations() {
  const byPhone = new Map();
  for (const m of messages) {
    if (!byPhone.has(m.phone)) {
      byPhone.set(m.phone, { phone: m.phone, name: m.name, requestId: m.requestId, messages: [] });
    }
    const g = byPhone.get(m.phone);
    g.messages.push(m);
    if (!g.name && m.name) g.name = m.name;
  }
  const groups = [...byPhone.values()].map((g) => {
    g.messages.sort((a, b) => new Date(a.at) - new Date(b.at));
    const last = g.messages[g.messages.length - 1];
    return {
      ...g,
      messageCount: g.messages.length,
      lastMessageAt: last?.at ?? null,
      lastMessage: last?.body ?? null,
    };
  });
  groups.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
  return groups;
}

// --- Optional Postgres persistence (Track 4) -------------------------------
let poolPromise = null;
async function getPool() {
  if (!isDbLive()) return null;
  if (!poolPromise) {
    poolPromise = (async () => {
      try {
        const { default: pg } = await import('pg');
        return new pg.Pool({ connectionString: config.databaseUrl });
      } catch (err) {
        console.error('[store] pg unavailable, staying in-memory only:', err.message);
        return null;
      }
    })();
  }
  return poolPromise;
}

async function persist(row) {
  try {
    const pool = await getPool();
    if (!pool) return;
    await pool.query(
      `INSERT INTO messages
         (id, request_id, contractor_phone, contractor_name, direction, channel, kind, body, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [row.id, row.requestId, row.phone, row.name, row.direction, row.channel, row.kind, row.body, row.at]
    );
  } catch (err) {
    console.error('[store] persist failed (in-memory still intact):', err.message);
  }
}
