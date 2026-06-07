import type { NotificationInsert, RepairRequest } from './types.ts';

export function buildContractorMessage(
  request: Pick<RepairRequest, 'category' | 'urgency' | 'location_text' | 'diagnosis' | 'image_url'>,
): string {
  const category = request.category ?? 'home repair';
  const urgency = request.urgency ?? 'normal';
  const location = request.location_text ?? 'the customer location';
  const diagnosis = request.diagnosis ?? 'The customer uploaded a repair photo and needs a quote.';

  return [
    `New ${category} repair request (${urgency} urgency) near ${location}.`,
    diagnosis,
    `Photo: ${request.image_url}`,
    'Reply with availability and price.',
  ].join(' ');
}

export function buildNegotiationFollowUpMessage(input: {
  targetPrice?: number | null;
  currentPrice?: number | null;
  availability?: string | null;
}): string {
  const target = typeof input.targetPrice === 'number' && Number.isFinite(input.targetPrice)
    ? `$${input.targetPrice}`
    : 'a sharper price';
  const current = typeof input.currentPrice === 'number' && Number.isFinite(input.currentPrice)
    ? ` Your current quote is $${input.currentPrice}.`
    : '';
  const availability = input.availability ? ` Availability noted: ${input.availability}.` : '';

  return `Thanks for the quick reply.${current}${availability} The homeowner is comparing a few options. Can you do any better at ${target}?`;
}

export function createMockNotification(input: {
  requestId: string;
  userId: string;
  contractorId: string | null;
  destination: string | null;
  message: string;
}): NotificationInsert {
  return {
    request_id: input.requestId,
    user_id: input.userId,
    contractor_id: input.contractorId,
    channel: 'mock',
    destination: input.destination,
    status: 'mock_sent',
    message: input.message,
    provider_message_id: null,
    last_error: null,
  };
}

function buildDemoContractorMessage(contractorName: string, message: string): string {
  return `[Demo contractor: ${contractorName}]\n${message}`;
}

export function createTelegramNotification(input: {
  requestId: string;
  userId: string;
  contractorId: string | null;
  contractorName: string;
  telegramChatId: string;
  message: string;
  providerMessageId?: string | null;
}): NotificationInsert {
  return {
    request_id: input.requestId,
    user_id: input.userId,
    contractor_id: input.contractorId,
    channel: 'telegram',
    destination: input.telegramChatId,
    status: 'sent',
    message: buildDemoContractorMessage(input.contractorName, input.message),
    provider_message_id: input.providerMessageId ?? null,
    last_error: null,
  };
}

export async function sendTelegramNotification(input: {
  botToken: string;
  chatId: string;
  message: string;
}): Promise<string> {
  const response = await fetch(`https://api.telegram.org/bot${input.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: input.chatId,
      text: input.message,
      disable_web_page_preview: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Telegram send failed: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json() as {
    ok?: boolean;
    description?: string;
    result?: { message_id?: string | number };
  };

  if (payload.ok === false) {
    throw new Error(`Telegram send failed: ${payload.description ?? 'unknown error'}`);
  }

  return String(payload.result?.message_id ?? '');
}

export async function sendWhatsAppNotification(input: {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  message: string;
}): Promise<string> {
  const body = new URLSearchParams({
    From: input.from,
    To: input.to.startsWith('whatsapp:') ? input.to : `whatsapp:${input.to}`,
    Body: input.message,
  });

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${input.accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${input.accountSid}:${input.authToken}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Twilio send failed: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();
  return String(payload.sid ?? '');
}
