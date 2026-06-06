import type { ContractorInsert, RepairRequest } from './types.ts';

/**
 * Map categories to better search query terms for finding the RIGHT contractors.
 */
const CATEGORY_SEARCH_TERMS: Record<string, string> = {
  hvac: 'HVAC air conditioning heating repair',
  electrical: 'licensed electrician electrical repair',
  plumbing: 'licensed plumber plumbing repair',
  painting: 'house painter painting contractor',
  roofing: 'roof repair roofing contractor',
  carpentry: 'carpenter woodwork repair contractor',
  landscaping: 'landscaping lawn garden contractor',
  cleaning: 'house cleaning service professional',
  appliance: 'appliance repair technician',
  architecture: 'residential architect home design',
  general: 'home repair handyman contractor',
  other: 'home repair maintenance contractor',
};

export function buildContractorQuery(request: Pick<RepairRequest, 'category' | 'brand' | 'model_name' | 'location_text'>): string {
  const category = request.category ?? 'general';
  const searchTerm = CATEGORY_SEARCH_TERMS[category] ?? CATEGORY_SEARCH_TERMS.general;

  return [
    request.brand,
    request.model_name,
    searchTerm,
    request.location_text,
  ]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(' ');
}

export function getMockContractors(category = 'home repair', locationText: string | null = 'San Francisco, CA'): ContractorInsert[] {
  const location = locationText ?? 'San Francisco, CA';
  const label = category || 'home repair';

  return [
    {
      name: `Rapid ${label.toUpperCase()} Response`,
      phone: '+14155550101',
      website: 'https://example.com/rapid-response',
      category: label,
      location_text: location,
      source: 'mock',
      source_ref: 'mock-rapid-response',
      metadata: { rating: 4.8, reviewCount: 140 },
    },
    {
      name: `Bay Area ${label} Pros`,
      phone: '+14155550202',
      website: 'https://example.com/bay-area-pros',
      category: label,
      location_text: location,
      source: 'mock',
      source_ref: 'mock-bay-area-pros',
      metadata: { rating: 4.6, reviewCount: 116 },
    },
    {
      name: `Neighborhood ${label} Experts`,
      phone: '+14155550303',
      website: 'https://example.com/neighborhood-experts',
      category: label,
      location_text: location,
      source: 'mock',
      source_ref: 'mock-neighborhood-experts',
      metadata: { rating: 4.7, reviewCount: 92 },
    },
  ];
}

export function parseSerpApiResults(
  payload: Record<string, unknown>,
  category: string,
  locationText: string | null,
): ContractorInsert[] {
  const localResults = Array.isArray(payload.local_results) ? payload.local_results : [];

  return localResults
    .map((result): ContractorInsert | null => {
      if (!result || typeof result !== 'object') return null;
      const record = result as Record<string, unknown>;
      const name = typeof record.title === 'string'
        ? record.title
        : typeof record.name === 'string'
          ? record.name
          : null;
      if (!name) return null;

      // Extract rating and review count from SerpAPI results
      const rating = typeof record.rating === 'number' ? record.rating : null;
      const reviewCount = typeof record.reviews === 'number'
        ? record.reviews
        : typeof record.reviews_original === 'string'
          ? parseInt(record.reviews_original.replace(/[^0-9]/g, ''), 10) || null
          : null;

      return {
        name,
        phone: typeof record.phone === 'string' ? record.phone : null,
        website: typeof record.website === 'string' ? record.website : null,
        category,
        location_text: locationText,
        source: 'serpapi',
        source_ref: typeof record.data_id === 'string'
          ? record.data_id
          : typeof record.place_id === 'string'
            ? record.place_id
            : typeof record.link === 'string'
              ? record.link
              : null,
        metadata: {
          rating,
          reviewCount,
          address: typeof record.address === 'string' ? record.address : null,
          hours: typeof record.hours === 'string' ? record.hours : null,
        },
      };
    })
    .filter((contractor): contractor is ContractorInsert => contractor !== null)
    .slice(0, 3);
}

export async function searchContractors(
  request: Pick<RepairRequest, 'category' | 'brand' | 'model_name' | 'location_text'>,
  serpApiKey?: string,
): Promise<ContractorInsert[]> {
  const category = request.category ?? 'home repair';
  const location = request.location_text ?? 'San Francisco, CA';

  if (!serpApiKey) {
    return getMockContractors(category, location);
  }

  const params = new URLSearchParams({
    engine: 'google_maps',
    q: buildContractorQuery(request),
    ll: '@37.7749,-122.4194,12z',
    type: 'search',
    api_key: serpApiKey,
  });

  const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`SerpApi search failed: ${response.status} ${await response.text()}`);
  }

  const contractors = parseSerpApiResults(await response.json(), category, location);
  return contractors.length > 0 ? contractors : getMockContractors(category, location);
}
