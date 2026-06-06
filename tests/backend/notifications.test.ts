import { describe, expect, it } from 'vitest';
import { buildContractorMessage, createMockNotification } from '../../functions/_shared/notifications.ts';

describe('notification helpers', () => {
  it('builds a concise contractor outreach message', () => {
    const message = buildContractorMessage({
      category: 'hvac',
      urgency: 'high',
      location_text: 'San Francisco, CA',
      diagnosis: 'Carrier unit is not cooling.',
      image_url: 'https://example.com/photo.jpg',
    });

    expect(message).toContain('hvac repair');
    expect(message).toContain('high urgency');
    expect(message).toContain('San Francisco, CA');
    expect(message).toContain('Carrier unit is not cooling.');
    expect(message).toContain('https://example.com/photo.jpg');
  });

  it('creates mock notification rows when messaging credentials are absent', () => {
    const notification = createMockNotification({
      requestId: 'request-1',
      userId: 'user-1',
      contractorId: 'contractor-1',
      destination: '+14155550101',
      message: 'Can you quote this repair?',
    });

    expect(notification).toMatchObject({
      request_id: 'request-1',
      user_id: 'user-1',
      contractor_id: 'contractor-1',
      channel: 'mock',
      destination: '+14155550101',
      status: 'mock_sent',
      message: 'Can you quote this repair?',
    });
  });
});
