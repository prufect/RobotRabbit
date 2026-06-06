// Quote engine: turn free-text contractor replies into structured, rankable
// quotes so the homeowner sees the best option first.

/**
 * Parse a contractor's free-text reply.
 * @param {string} body e.g. "YES, $150, can be there in 1 hour"
 * @returns {{available:boolean, quote:number|null, etaMinutes:number|null, etaText:string|null}}
 */
export function parseReply(body = '') {
  const text = String(body);

  // Negations win — "not available", "sorry", "can't", a leading "no", etc.
  const negative =
    /\b(not available|unavailable|can'?t|cannot|won'?t|busy|booked|no puedo|no disponible|no estoy)\b/i.test(text) ||
    /\b(sorry|lo siento|desafortunadamente|unfortunately)\b/i.test(text) ||
    /^\s*(no|nope|nah)\b/i.test(text);
  const positive = /\b(yes|yep|yeah|sure|available|interested|sí|si|claro|disponible)\b/i.test(text);
  const available = positive && !negative;

  const feeMatch = text.match(/\$\s?(\d+(?:\.\d{1,2})?)/);
  const quote = feeMatch ? Number(feeMatch[1]) : null;

  const { etaMinutes, etaText } = parseEta(text);
  return { available, quote, etaMinutes, etaText };
}

// Rough "how soon" estimate in minutes. Lower = sooner = better.
function parseEta(text) {
  const t = text.toLowerCase();

  if (/\b(now|right now|immediately|ahora|ya)\b/.test(t)) return { etaMinutes: 0, etaText: 'now' };

  const rel = t.match(/\b(\d+)\s*(min|mins|minute|minutes|hour|hours|hr|hrs)\b/);
  if (rel) {
    const n = Number(rel[1]);
    const isHour = rel[2].startsWith('h');
    const mins = isHour ? n * 60 : n;
    return { etaMinutes: mins, etaText: `${n} ${isHour ? 'hour' : 'min'}${n === 1 ? '' : 's'}` };
  }

  if (/\b(today|hoy)\b/.test(t)) return { etaMinutes: 8 * 60, etaText: 'today' };
  if (/\b(tomorrow|mañana|manana)\b/.test(t)) return { etaMinutes: 24 * 60, etaText: 'tomorrow' };

  return { etaMinutes: null, etaText: null };
}

/**
 * Rank parsed replies. Only available ones are ranked.
 * Priority: lowest price first; ties broken by soonest ETA.
 * Replies missing a price sort after those that have one.
 *
 * @param {Array} replies items shaped like the /webhooks/twilio store
 * @returns {{ranked:Array, best:object|null}}
 */
export function rankQuotes(replies = []) {
  const ranked = replies
    .filter((r) => r.available)
    .slice()
    .sort((a, b) => {
      const pa = a.quote ?? Infinity;
      const pb = b.quote ?? Infinity;
      if (pa !== pb) return pa - pb;
      const ea = a.etaMinutes ?? Infinity;
      const eb = b.etaMinutes ?? Infinity;
      return ea - eb;
    });

  return { ranked, best: ranked[0] || null };
}
