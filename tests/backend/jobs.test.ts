import { describe, expect, it } from 'vitest';
import { chooseBestQuote, getNextRunAfter, shouldRetryJob } from '../../functions/_shared/jobs.ts';

describe('job and quote helpers', () => {
  it('backs off failed jobs exponentially and stops after the max attempts', () => {
    expect(shouldRetryJob({ attempt_count: 0 }, 3)).toBe(true);
    expect(shouldRetryJob({ attempt_count: 2 }, 3)).toBe(true);
    expect(shouldRetryJob({ attempt_count: 3 }, 3)).toBe(false);

    const firstRetry = getNextRunAfter(0, new Date('2026-06-06T10:00:00.000Z'));
    const thirdRetry = getNextRunAfter(2, new Date('2026-06-06T10:00:00.000Z'));

    expect(firstRetry.toISOString()).toBe('2026-06-06T10:00:30.000Z');
    expect(thirdRetry.toISOString()).toBe('2026-06-06T10:02:00.000Z');
  });

  it('chooses the lowest available quote and uses faster availability as tie breaker', () => {
    const best = chooseBestQuote([
      { id: 'a', available: true, price: 200, availability: '30 minutes' },
      { id: 'b', available: true, price: 125, availability: 'tomorrow' },
      { id: 'c', available: true, price: 125, availability: '2 hours' },
      { id: 'd', available: false, price: 50, availability: '10 minutes' },
    ]);

    expect(best?.id).toBe('c');
  });
});
