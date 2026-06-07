import { describe, expect, it } from 'vitest';
import * as notificationHelpers from '../../functions/_shared/notifications.ts';

const { buildContractorMessage, createMockNotification } = notificationHelpers;

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

  it('creates Telegram demo notification rows for a hardcoded chat', () => {
    expect(typeof notificationHelpers.createTelegramNotification).toBe('function');

    const notification = notificationHelpers.createTelegramNotification({
      requestId: 'request-1',
      userId: 'user-1',
      contractorId: 'contractor-1',
      contractorName: 'Bay Area Painting',
      telegramChatId: '123456789',
      message: 'Can you quote this repair?',
      providerMessageId: 'telegram-message-1',
    });

    expect(notification).toMatchObject({
      request_id: 'request-1',
      user_id: 'user-1',
      contractor_id: 'contractor-1',
      channel: 'telegram',
      destination: '123456789',
      status: 'sent',
      message: '[Demo contractor: Bay Area Painting]\nCan you quote this repair?',
      provider_message_id: 'telegram-message-1',
      last_error: null,
    });
  });

  it('builds a contractor counteroffer follow-up message', () => {
    expect(typeof notificationHelpers.buildNegotiationFollowUpMessage).toBe('function');

    const message = notificationHelpers.buildNegotiationFollowUpMessage({
      targetPrice: 250,
      currentPrice: 300,
      availability: 'today at 4',
    });

    expect(message).toContain('$250');
    expect(message).toContain('$300');
    expect(message).toContain('today at 4');
    expect(message).toContain('Can you do any better');
  });
});
