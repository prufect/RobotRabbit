import { describe, expect, it } from 'vitest';
import { buildContractorQuery, getMockContractors, parseSerpApiResults } from '../../functions/_shared/search.ts';

describe('contractor search helpers', () => {
  it('builds a contractor search query from request fields', () => {
    expect(buildContractorQuery({
      category: 'plumbing',
      brand: 'Kohler',
      model_name: 'K-123',
      location_text: 'Oakland, CA',
    })).toBe('Kohler K-123 plumbing repair Oakland, CA');
  });

  it('returns three deterministic mock contractors with requested category and location', () => {
    const contractors = getMockContractors('hvac', 'San Francisco, CA');

    expect(contractors).toHaveLength(3);
    expect(contractors[0]).toMatchObject({
      category: 'hvac',
      location_text: 'San Francisco, CA',
      source: 'mock',
    });
  });

  it('parses SerpApi local results into contractor records', () => {
    const contractors = parseSerpApiResults({
      local_results: [
        {
          title: 'Bay Repair',
          phone: '+14155550101',
          website: 'https://bay.example',
          data_id: 'abc',
          rating: 4.8,
        },
      ],
    }, 'appliance', 'San Jose, CA');

    expect(contractors).toEqual([
      {
        name: 'Bay Repair',
        phone: '+14155550101',
        website: 'https://bay.example',
        category: 'appliance',
        location_text: 'San Jose, CA',
        source: 'serpapi',
        source_ref: 'abc',
        metadata: { rating: 4.8 },
      },
    ]);
  });
});
