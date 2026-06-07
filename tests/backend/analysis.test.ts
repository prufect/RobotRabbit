import { describe, expect, it } from 'vitest';
import { analyzeRepairImage, normalizeAnalysis, parseJsonObject } from '../../functions/_shared/analysis.ts';

describe('analysis helpers', () => {
  it('normalizes an identified model result into the repair request fields', () => {
    const normalized = normalizeAnalysis({
      isIdentified: true,
      category: 'hvac',
      brand: 'Carrier',
      modelNumber: 'Infinity 26',
      messageToUser: 'I found it.',
      contractorSearchQuery: 'Carrier HVAC repair',
    });

    expect(normalized).toEqual({
      isIdentified: true,
      confidenceScore: 100,
      status: 'identified',
      category: 'hvac',
      brand: 'Carrier',
      modelNumber: 'Infinity 26',
      diagnosis: 'I found it.',
      nextQuestion: null,
      messageToUser: 'I found it.',
      clarifyingQuestion: null,
      contractorSearchQuery: 'Carrier HVAC repair',
    });
  });

  it('normalizes missing image detail into a needs_info response', () => {
    const normalized = normalizeAnalysis({
      isIdentified: false,
      category: 'unknown',
      messageToUser: 'Please upload the model sticker.',
    });

    expect(normalized.status).toBe('needs_info');
    expect(normalized.nextQuestion).toBe('Please upload the model sticker.');
    expect(normalized.contractorSearchQuery).toBeNull();
  });

  it('extracts JSON from fenced model output', () => {
    expect(parseJsonObject('```json\n{"available":true,"price":125}\n```')).toEqual({
      available: true,
      price: 125,
    });
  });

  it('fails explicitly instead of mocking analysis without model credentials', async () => {
    await expect(analyzeRepairImage('https://example.com/photo.jpg')).rejects.toThrow(
      'No vision API keys configured',
    );
  });
});
