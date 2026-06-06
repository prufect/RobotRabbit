/**
 * Tests for src/utils/validation.js
 */

import {
  validateAnalyzeRequest,
  validateContractorReplyRequest,
} from '../src/utils/validation.js';

describe('validateAnalyzeRequest', () => {
  const validBody = {
    conversationId: 'uuid-1234',
    userId: 'user-5678',
    imageUrl: 'https://storage.insforge.com/bucket/img_123.jpg',
    urgency: 'high',
  };

  it('should pass with all required fields', () => {
    const result = validateAnalyzeRequest(validBody);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should pass without optional urgency', () => {
    const { urgency, ...bodyWithoutUrgency } = validBody;
    const result = validateAnalyzeRequest(bodyWithoutUrgency);
    expect(result.valid).toBe(true);
  });

  it('should fail when conversationId is missing', () => {
    const { conversationId, ...body } = validBody;
    const result = validateAnalyzeRequest(body);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('conversationId is required and must be a string.');
  });

  it('should fail when userId is missing', () => {
    const { userId, ...body } = validBody;
    const result = validateAnalyzeRequest(body);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('userId is required and must be a string.');
  });

  it('should fail when imageUrl is missing', () => {
    const { imageUrl, ...body } = validBody;
    const result = validateAnalyzeRequest(body);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('imageUrl is required and must be a string.');
  });

  it('should fail when imageUrl is not a valid URL', () => {
    const body = { ...validBody, imageUrl: 'not-a-url' };
    const result = validateAnalyzeRequest(body);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('imageUrl must be a valid HTTP or HTTPS URL.');
  });

  it('should fail when urgency is not a string', () => {
    const body = { ...validBody, urgency: 42 };
    const result = validateAnalyzeRequest(body);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('urgency must be a string when provided.');
  });

  it('should fail when body is null', () => {
    const result = validateAnalyzeRequest(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Request body must be a JSON object.');
  });

  it('should collect multiple errors', () => {
    const result = validateAnalyzeRequest({ imageUrl: 'bad' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3); // conversationId, userId, imageUrl format
  });
});

describe('validateContractorReplyRequest', () => {
  const validBody = {
    conversationId: 'uuid-1234',
    contractorPhone: '+14155550101',
    contractorName: "Bob's Quick HVAC",
    messageBody: 'Available in 1 hour. $150.',
  };

  it('should pass with all required fields', () => {
    const result = validateContractorReplyRequest(validBody);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail when conversationId is missing', () => {
    const { conversationId, ...body } = validBody;
    const result = validateContractorReplyRequest(body);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('conversationId is required and must be a string.');
  });

  it('should fail when contractorPhone is missing', () => {
    const { contractorPhone, ...body } = validBody;
    const result = validateContractorReplyRequest(body);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('contractorPhone is required and must be a string.');
  });

  it('should fail when contractorName is missing', () => {
    const { contractorName, ...body } = validBody;
    const result = validateContractorReplyRequest(body);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('contractorName is required and must be a string.');
  });

  it('should fail when messageBody is missing', () => {
    const { messageBody, ...body } = validBody;
    const result = validateContractorReplyRequest(body);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('messageBody is required and must be a string.');
  });

  it('should fail when body is null', () => {
    const result = validateContractorReplyRequest(null);
    expect(result.valid).toBe(false);
  });
});
