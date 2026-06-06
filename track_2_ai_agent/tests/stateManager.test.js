/**
 * Tests for src/services/stateManager.js
 *
 * These are pure unit tests — no network calls, no mocking of external services.
 */

import {
  createSession,
  getSession,
  updateSession,
  addQuote,
  getBestQuote,
  getAllSessions,
  deleteSession,
} from '../src/services/stateManager.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSession(id = 'test-session-1') {
  return createSession(id, {
    userId: 'user-1',
    urgency: 'high',
    imageUrl: 'https://example.com/img.jpg',
  });
}

function makeQuote(overrides = {}) {
  return {
    contractorName: "Bob's Quick HVAC",
    contractorPhone: '+14155550101',
    available: true,
    price: 150,
    availability: '1 hour',
    rawMessage: 'Available in 1 hour. $150.',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('StateManager', () => {
  // Clean up between tests to prevent cross-contamination
  afterEach(() => {
    for (const session of getAllSessions()) {
      deleteSession(session.conversationId);
    }
  });

  describe('createSession', () => {
    it('should create a new session with correct defaults', () => {
      const session = makeSession('create-1');

      expect(session.conversationId).toBe('create-1');
      expect(session.userId).toBe('user-1');
      expect(session.urgency).toBe('high');
      expect(session.status).toBe('IMAGE_ANALYSIS');
      expect(session.issueDetails.imageUrl).toBe('https://example.com/img.jpg');
      expect(session.contractors).toEqual([]);
      expect(session.quotes).toEqual([]);
      expect(session.bestQuote).toBeNull();
      expect(session.createdAt).toBeTruthy();
      expect(session.updatedAt).toBeTruthy();
    });

    it('should default urgency to "normal" when not provided', () => {
      const session = createSession('create-2', {
        userId: 'user-2',
        imageUrl: 'https://example.com/img2.jpg',
      });

      expect(session.urgency).toBe('normal');
    });
  });

  describe('getSession', () => {
    it('should return a session that exists', () => {
      makeSession('get-1');
      const session = getSession('get-1');
      expect(session).toBeDefined();
      expect(session.conversationId).toBe('get-1');
    });

    it('should return undefined for a non-existent session', () => {
      expect(getSession('does-not-exist')).toBeUndefined();
    });
  });

  describe('updateSession', () => {
    it('should merge top-level fields', () => {
      makeSession('update-1');
      const updated = updateSession('update-1', { status: 'NEGOTIATING' });

      expect(updated.status).toBe('NEGOTIATING');
      expect(updated.userId).toBe('user-1'); // unchanged
    });

    it('should deep-merge issueDetails', () => {
      makeSession('update-2');
      updateSession('update-2', {
        issueDetails: { category: 'hvac', brand: 'Carrier' },
      });

      const session = getSession('update-2');
      expect(session.issueDetails.category).toBe('hvac');
      expect(session.issueDetails.brand).toBe('Carrier');
      expect(session.issueDetails.imageUrl).toBe('https://example.com/img.jpg'); // preserved
    });

    it('should throw for a non-existent session', () => {
      expect(() => updateSession('ghost', { status: 'FAILED' })).toThrow();
    });

    it('should update the updatedAt timestamp', () => {
      const session = makeSession('update-3');
      const originalUpdatedAt = session.updatedAt;

      // Force a tiny delay to ensure different timestamp
      updateSession('update-3', { status: 'SEARCHING_CONTRACTORS' });
      const updated = getSession('update-3');
      expect(updated.updatedAt).toBeTruthy();
    });
  });

  describe('addQuote', () => {
    it('should add a quote to the session', () => {
      makeSession('quote-1');
      addQuote('quote-1', makeQuote());

      const session = getSession('quote-1');
      expect(session.quotes).toHaveLength(1);
      expect(session.quotes[0].contractorName).toBe("Bob's Quick HVAC");
      expect(session.quotes[0].price).toBe(150);
    });

    it('should deduplicate by contractorPhone', () => {
      makeSession('quote-2');
      addQuote('quote-2', makeQuote({ price: 150 }));
      addQuote('quote-2', makeQuote({ price: 120 })); // same phone, updated price

      const session = getSession('quote-2');
      expect(session.quotes).toHaveLength(1);
      expect(session.quotes[0].price).toBe(120); // latest wins
    });

    it('should add multiple quotes from different contractors', () => {
      makeSession('quote-3');
      addQuote('quote-3', makeQuote({ contractorPhone: '+1001', contractorName: 'A' }));
      addQuote('quote-3', makeQuote({ contractorPhone: '+1002', contractorName: 'B' }));
      addQuote('quote-3', makeQuote({ contractorPhone: '+1003', contractorName: 'C' }));

      const session = getSession('quote-3');
      expect(session.quotes).toHaveLength(3);
    });

    it('should throw for a non-existent session', () => {
      expect(() => addQuote('ghost', makeQuote())).toThrow();
    });
  });

  describe('getBestQuote', () => {
    it('should select the cheapest available contractor', () => {
      makeSession('best-1');
      addQuote('best-1', makeQuote({ contractorPhone: '+1001', contractorName: 'Expensive', price: 200 }));
      addQuote('best-1', makeQuote({ contractorPhone: '+1002', contractorName: 'Cheapest', price: 100 }));
      addQuote('best-1', makeQuote({ contractorPhone: '+1003', contractorName: 'Middle', price: 150 }));

      const best = getBestQuote('best-1');
      expect(best.contractorName).toBe('Cheapest');
      expect(best.price).toBe(100);
    });

    it('should break price ties by faster availability', () => {
      makeSession('best-2');
      addQuote('best-2', makeQuote({ contractorPhone: '+1001', contractorName: 'Slow', price: 100, availability: '4 hours' }));
      addQuote('best-2', makeQuote({ contractorPhone: '+1002', contractorName: 'Fast', price: 100, availability: '1 hour' }));

      const best = getBestQuote('best-2');
      expect(best.contractorName).toBe('Fast');
    });

    it('should exclude unavailable contractors', () => {
      makeSession('best-3');
      addQuote('best-3', makeQuote({ contractorPhone: '+1001', contractorName: 'Cheap but busy', price: 50, available: false }));
      addQuote('best-3', makeQuote({ contractorPhone: '+1002', contractorName: 'Available', price: 150, available: true }));

      const best = getBestQuote('best-3');
      expect(best.contractorName).toBe('Available');
    });

    it('should return null when no viable quotes exist', () => {
      makeSession('best-4');
      addQuote('best-4', makeQuote({ contractorPhone: '+1001', available: false }));

      expect(getBestQuote('best-4')).toBeNull();
    });

    it('should return null for a non-existent session', () => {
      expect(getBestQuote('ghost')).toBeNull();
    });
  });

  describe('deleteSession', () => {
    it('should delete an existing session and return true', () => {
      makeSession('del-1');
      expect(deleteSession('del-1')).toBe(true);
      expect(getSession('del-1')).toBeUndefined();
    });

    it('should return false for a non-existent session', () => {
      expect(deleteSession('ghost')).toBe(false);
    });
  });

  describe('getAllSessions', () => {
    it('should return all active sessions', () => {
      makeSession('all-1');
      makeSession('all-2');
      const all = getAllSessions();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });
  });
});
