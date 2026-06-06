import axios from 'axios';
import { config, isSerperLive } from './config.js';
import { mockContractors } from './mockData.js';

/**
 * Find local contractors for a given query/location.
 * Uses Serper.dev (Google Places) when a key is configured; otherwise returns
 * deterministic mock data so the demo always succeeds.
 *
 * @param {string} query    e.g. "Carrier HVAC repair"
 * @param {string} location e.g. "San Francisco, CA"
 * @param {number} limit
 * @returns {Promise<{results: Array, source: 'serper'|'mock'}>}
 */
export async function searchContractors(query, location = config.defaultLocation, limit = 3) {
  if (!isSerperLive()) {
    return { results: mockContractors(query, limit), source: 'mock' };
  }

  try {
    const { data } = await axios.post(
      'https://google.serper.dev/places',
      { q: query, location },
      {
        headers: {
          'X-API-KEY': config.serperApiKey,
          'Content-Type': 'application/json',
        },
        timeout: 8000,
      }
    );

    const results = (data.places || [])
      .filter((p) => p.phoneNumber) // can't message someone without a number
      .slice(0, limit)
      .map((p) => ({
        name: p.title,
        phone: normalizePhone(p.phoneNumber),
        rating: p.rating ?? null,
        address: p.address ?? null,
      }));

    // Serper can return zero rows with phones; fall back so the chain never breaks.
    if (results.length === 0) {
      return { results: mockContractors(query, limit), source: 'mock' };
    }
    return { results, source: 'serper' };
  } catch (err) {
    console.error('[search] Serper failed, falling back to mock:', err.message);
    return { results: mockContractors(query, limit), source: 'mock' };
  }
}

// Serper returns human-formatted numbers like "(415) 555-0101". Twilio wants E.164.
function normalizePhone(raw) {
  if (!raw) return raw;
  const digits = String(raw).replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return `+1${digits}`; // assume US for the demo
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits;
}
