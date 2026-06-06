/**
 * Tests for the POST /api/analyze and POST /api/contractor-reply endpoints.
 *
 * These tests mock the Gemini service and image processor to test the handlers
 * in isolation, without making real API calls.
 */

import { jest } from '@jest/globals';

// ─── Mock modules BEFORE importing the app ───────────────────────────────────

// Mock gemini service
const mockAnalyzeImage = jest.fn();
const mockParseContractorReply = jest.fn();

jest.unstable_mockModule('../src/services/gemini.js', () => ({
  analyzeImage: mockAnalyzeImage,
  parseContractorReply: mockParseContractorReply,
}));

// Mock image processor (since gemini.js internally calls it, but we mock
// gemini.js entirely, this is a safety net)
jest.unstable_mockModule('../src/services/imageProcessor.js', () => ({
  fetchAndProcessImage: jest.fn().mockResolvedValue({
    base64: 'dGVzdA==',
    mimeType: 'image/jpeg',
  }),
}));

// Now dynamically import the app and supertest AFTER mocks are in place
const { default: supertest } = await import('supertest');
const { default: app } = await import('../src/index.js');

// Also import state manager for setup/cleanup
const state = await import('../src/services/stateManager.js');

const request = supertest(app);

// ─── Test Suites ─────────────────────────────────────────────────────────────

describe('POST /api/analyze', () => {
  afterEach(() => {
    jest.clearAllMocks();
    // Clean up state
    for (const session of state.getAllSessions()) {
      state.deleteSession(session.conversationId);
    }
  });

  const validBody = {
    conversationId: 'test-conv-1',
    userId: 'test-user-1',
    imageUrl: 'https://example.com/test-image.jpg',
    urgency: 'high',
  };

  it('should return 200 with isIdentified=true when appliance is recognized', async () => {
    mockAnalyzeImage.mockResolvedValue({
      isIdentified: true,
      category: 'hvac',
      brand: 'Carrier',
      modelNumber: 'Infinity 26',
      messageToUser: 'I have identified a Carrier Infinity 26 HVAC unit.',
      contractorSearchQuery: 'Carrier HVAC repair',
    });

    const res = await request.post('/api/analyze').send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.isIdentified).toBe(true);
    expect(res.body.brand).toBe('Carrier');
    expect(res.body.modelNumber).toBe('Infinity 26');
    expect(res.body.category).toBe('hvac');
    expect(res.body.contractorSearchQuery).toBe('Carrier HVAC repair');
    expect(mockAnalyzeImage).toHaveBeenCalledWith(validBody.imageUrl);
  });

  it('should return 200 with isIdentified=false when appliance cannot be recognized', async () => {
    mockAnalyzeImage.mockResolvedValue({
      isIdentified: false,
      category: 'unknown',
      brand: null,
      modelNumber: null,
      messageToUser: 'I can see an electrical panel, but the label is not visible.',
      contractorSearchQuery: null,
    });

    const res = await request.post('/api/analyze').send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.isIdentified).toBe(false);
    expect(res.body.brand).toBeNull();
    expect(res.body.messageToUser).toContain('electrical panel');
  });

  it('should create a session in the state manager', async () => {
    mockAnalyzeImage.mockResolvedValue({
      isIdentified: true,
      category: 'hvac',
      brand: 'Carrier',
      modelNumber: 'Infinity 26',
      messageToUser: 'Identified.',
      contractorSearchQuery: 'Carrier HVAC repair',
    });

    await request.post('/api/analyze').send(validBody);

    const session = state.getSession('test-conv-1');
    expect(session).toBeDefined();
    expect(session.userId).toBe('test-user-1');
    expect(session.urgency).toBe('high');
  });

  it('should return 400 when required fields are missing', async () => {
    const res = await request.post('/api/analyze').send({
      conversationId: 'test-conv-2',
      // missing userId and imageUrl
    });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 when imageUrl is invalid', async () => {
    const res = await request.post('/api/analyze').send({
      ...validBody,
      imageUrl: 'not-a-url',
    });

    expect(res.status).toBe(400);
  });

  it('should handle Gemini errors gracefully', async () => {
    mockAnalyzeImage.mockRejectedValue(new Error('Gemini API is down'));

    const res = await request.post('/api/analyze').send(validBody);

    expect(res.status).toBe(500);
    expect(res.body.status).toBe('error');
  });
});

describe('POST /api/contractor-reply', () => {
  beforeEach(() => {
    // Set up a session in NEGOTIATING state
    state.createSession('neg-conv-1', {
      userId: 'user-1',
      urgency: 'high',
      imageUrl: 'https://example.com/img.jpg',
    });
    state.updateSession('neg-conv-1', {
      status: 'NEGOTIATING',
      contractors: [
        { name: "Bob's HVAC", phone: '+14155550101' },
        { name: 'SF Experts', phone: '+14155550202' },
        { name: 'Bay Fix', phone: '+14155550303' },
      ],
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    for (const session of state.getAllSessions()) {
      state.deleteSession(session.conversationId);
    }
  });

  it('should record a quote and return progress (not enough quotes yet)', async () => {
    mockParseContractorReply.mockResolvedValue({
      available: true,
      price: 150,
      availability: '1 hour',
      rawMessage: 'Available in 1 hour. $150.',
    });

    const res = await request.post('/api/contractor-reply').send({
      conversationId: 'neg-conv-1',
      contractorPhone: '+14155550101',
      contractorName: "Bob's HVAC",
      messageBody: 'Available in 1 hour. $150.',
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.action).toBe('quote_recorded');
    expect(res.body.quotesReceived).toBe(1);
    expect(res.body.readyForUser).toBe(false);
  });

  it('should complete negotiation when MIN_QUOTES_REQUIRED are met', async () => {
    // Add 3 quotes
    const quotes = [
      { available: true, price: 150, availability: '1 hour' },
      { available: true, price: 120, availability: '2 hours' },
      { available: true, price: 180, availability: 'tomorrow' },
    ];
    const contractors = [
      { phone: '+14155550101', name: "Bob's HVAC" },
      { phone: '+14155550202', name: 'SF Experts' },
      { phone: '+14155550303', name: 'Bay Fix' },
    ];

    for (let i = 0; i < 3; i++) {
      mockParseContractorReply.mockResolvedValueOnce({
        ...quotes[i],
        rawMessage: `msg ${i}`,
      });

      const res = await request.post('/api/contractor-reply').send({
        conversationId: 'neg-conv-1',
        contractorPhone: contractors[i].phone,
        contractorName: contractors[i].name,
        messageBody: `msg ${i}`,
      });

      if (i < 2) {
        expect(res.body.action).toBe('quote_recorded');
        expect(res.body.readyForUser).toBe(false);
      } else {
        // Third quote triggers completion
        expect(res.body.action).toBe('negotiation_complete');
        expect(res.body.readyForUser).toBe(true);
        expect(res.body.bestQuote).toBeDefined();
        expect(res.body.bestQuote.price).toBe(120); // cheapest
        expect(res.body.bestQuote.contractorName).toBe('SF Experts');
        expect(res.body.allQuotes).toHaveLength(3);
        expect(res.body.messageToUser).toContain('3 quotes');
      }
    }

    // Verify session is COMPLETED
    const session = state.getSession('neg-conv-1');
    expect(session.status).toBe('COMPLETED');
  });

  it('should return 400 when required fields are missing', async () => {
    const res = await request.post('/api/contractor-reply').send({
      conversationId: 'neg-conv-1',
      // missing contractorPhone, contractorName, messageBody
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 404 when session does not exist', async () => {
    mockParseContractorReply.mockResolvedValue({
      available: true,
      price: 100,
      availability: '1 hour',
      rawMessage: 'test',
    });

    const res = await request.post('/api/contractor-reply').send({
      conversationId: 'non-existent',
      contractorPhone: '+10000000000',
      contractorName: 'Ghost',
      messageBody: 'test',
    });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('STATE_ERROR');
  });
});

describe('GET /api/status/:conversationId', () => {
  beforeEach(() => {
    state.createSession('status-conv-1', {
      userId: 'user-1',
      urgency: 'high',
      imageUrl: 'https://example.com/img.jpg',
    });
  });

  afterEach(() => {
    for (const session of state.getAllSessions()) {
      state.deleteSession(session.conversationId);
    }
  });

  it('should return the session state', async () => {
    const res = await request.get('/api/status/status-conv-1');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.session.conversationId).toBe('status-conv-1');
    expect(res.body.session.status).toBe('IMAGE_ANALYSIS');
    expect(res.body.session.quotesReceived).toBe(0);
  });

  it('should return 404 for a non-existent session', async () => {
    const res = await request.get('/api/status/non-existent');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('STATE_ERROR');
  });
});

describe('GET /api/health', () => {
  it('should return 200 with service info', async () => {
    const res = await request.get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('track-2-ai-agent');
    expect(res.body.geminiModel).toBeDefined();
  });
});

describe('404 catch-all', () => {
  it('should return 404 for unknown routes', async () => {
    const res = await request.get('/api/unknown-route');

    expect(res.status).toBe(404);
    expect(res.body.status).toBe('error');
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
