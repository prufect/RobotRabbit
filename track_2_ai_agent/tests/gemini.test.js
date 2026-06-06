/**
 * Tests for src/services/gemini.js
 *
 * Mocks the @google/generative-ai SDK to test retry logic, JSON extraction,
 * and error handling without real API calls.
 */

import { jest } from '@jest/globals';

// ─── Mock @google/generative-ai ─────────────────────────────────────────────

const mockGenerateContent = jest.fn();

jest.unstable_mockModule('@google/generative-ai', () => {
  class MockGoogleGenerativeAI {
    getGenerativeModel() {
      return { generateContent: mockGenerateContent };
    }
  }
  return { GoogleGenerativeAI: MockGoogleGenerativeAI };
});

// Mock image processor
jest.unstable_mockModule('../src/services/imageProcessor.js', () => ({
  fetchAndProcessImage: jest.fn().mockResolvedValue({
    base64: 'dGVzdA==',
    mimeType: 'image/jpeg',
  }),
}));

// Import AFTER mocks
const { analyzeImage, parseContractorReply } = await import('../src/services/gemini.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function geminiResponse(jsonObj) {
  return {
    response: {
      text: () => JSON.stringify(jsonObj),
    },
  };
}

function geminiRawResponse(text) {
  return {
    response: {
      text: () => text,
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('analyzeImage', () => {
  afterEach(() => jest.clearAllMocks());

  it('should return parsed JSON from Gemini response', async () => {
    const expected = {
      isIdentified: true,
      category: 'hvac',
      brand: 'Carrier',
      modelNumber: 'Infinity 26',
      messageToUser: 'Identified a Carrier Infinity 26.',
      contractorSearchQuery: 'Carrier HVAC repair',
    };

    mockGenerateContent.mockResolvedValue(geminiResponse(expected));

    const result = await analyzeImage('https://example.com/img.jpg');

    expect(result).toEqual(expected);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('should extract JSON from markdown-fenced response', async () => {
    const expected = { isIdentified: false, category: 'unknown' };
    const fenced = '```json\n' + JSON.stringify(expected) + '\n```';

    mockGenerateContent.mockResolvedValue(geminiRawResponse(fenced));

    const result = await analyzeImage('https://example.com/img.jpg');
    expect(result.isIdentified).toBe(false);
  });

  it('should extract JSON from response with surrounding text', async () => {
    const expected = { isIdentified: true, category: 'electrical_panel', brand: 'Square D' };
    const messy = 'Here is the result:\n' + JSON.stringify(expected) + '\nHope this helps!';

    mockGenerateContent.mockResolvedValue(geminiRawResponse(messy));

    const result = await analyzeImage('https://example.com/img.jpg');
    expect(result.brand).toBe('Square D');
  });

  it('should retry on transient failure and succeed', async () => {
    const expected = { isIdentified: true, category: 'hvac', brand: 'Trane' };

    mockGenerateContent
      .mockRejectedValueOnce(new Error('Network timeout'))
      .mockResolvedValueOnce(geminiResponse(expected));

    const result = await analyzeImage('https://example.com/img.jpg');

    expect(result.brand).toBe('Trane');
    expect(mockGenerateContent).toHaveBeenCalledTimes(2); // 1 fail + 1 success
  });

  it('should throw after exhausting retries', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'));

    await expect(analyzeImage('https://example.com/img.jpg')).rejects.toThrow('Fail 2');
  });

  it('should throw when response contains no JSON', async () => {
    mockGenerateContent.mockResolvedValue(geminiRawResponse('I cannot analyze this image.'));

    await expect(analyzeImage('https://example.com/img.jpg')).rejects.toThrow();
  });
});

describe('parseContractorReply', () => {
  afterEach(() => jest.clearAllMocks());

  it('should parse a contractor reply and return structured data', async () => {
    const expected = {
      available: true,
      price: 150,
      availability: '1 hour',
      rawMessage: 'Available in 1 hour. $150.',
    };

    mockGenerateContent.mockResolvedValue(geminiResponse(expected));

    const result = await parseContractorReply('Available in 1 hour. $150.');

    expect(result.available).toBe(true);
    expect(result.price).toBe(150);
    expect(result.availability).toBe('1 hour');
    // rawMessage should be overridden with the original input
    expect(result.rawMessage).toBe('Available in 1 hour. $150.');
  });

  it('should handle a decline reply', async () => {
    const expected = {
      available: false,
      price: null,
      availability: null,
      rawMessage: "Sorry, we're booked up for the week.",
    };

    mockGenerateContent.mockResolvedValue(geminiResponse(expected));

    const result = await parseContractorReply("Sorry, we're booked up for the week.");

    expect(result.available).toBe(false);
    expect(result.price).toBeNull();
  });

  it('should always set rawMessage to the original input', async () => {
    mockGenerateContent.mockResolvedValue(geminiResponse({
      available: true,
      price: 200,
      availability: '3 hours',
      rawMessage: 'something else',
    }));

    const result = await parseContractorReply('Original message text');
    expect(result.rawMessage).toBe('Original message text');
  });
});
