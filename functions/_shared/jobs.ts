import type { ContractorQuote } from './types.ts';

export function shouldRetryJob(job: { attempt_count: number }, maxAttempts = 3): boolean {
  return job.attempt_count < maxAttempts;
}

export function getNextRunAfter(attemptCount: number, from = new Date()): Date {
  const delaySeconds = Math.min(30 * 2 ** attemptCount, 15 * 60);
  return new Date(from.getTime() + delaySeconds * 1000);
}

function availabilityToMinutes(availability: string | null): number {
  if (!availability) return Number.POSITIVE_INFINITY;
  const lower = availability.toLowerCase();
  const numMatch = lower.match(/(\d+(?:\.\d+)?)/);
  const num = numMatch ? Number(numMatch[1]) : Number.POSITIVE_INFINITY;

  if (lower.includes('min')) return num;
  if (lower.includes('hour')) return num * 60;
  if (lower.includes('day')) return num * 1440;
  if (lower.includes('tomorrow')) return 1440;
  if (lower.includes('today')) return 120;

  return num;
}

export function chooseBestQuote<T extends ContractorQuote>(quotes: T[]): T | null {
  const viable = quotes.filter(quote => quote.available !== false);
  if (viable.length === 0) return null;

  return [...viable].sort((a, b) => {
    const priceDiff = (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY);
    if (priceDiff !== 0) return priceDiff;
    return availabilityToMinutes(a.availability) - availabilityToMinutes(b.availability);
  })[0];
}
