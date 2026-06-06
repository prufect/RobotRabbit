import 'dotenv/config';

const bool = (v) => String(v).toLowerCase() === 'true';

export const config = {
  port: Number(process.env.PORT) || 3003,
  mockMode: bool(process.env.MOCK_MODE),
  defaultLocation: process.env.DEFAULT_LOCATION || 'San Francisco, CA',

  serperApiKey: process.env.SERPER_API_KEY || '',

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    from: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886',
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    defaultChatId: process.env.TELEGRAM_DEFAULT_CHAT_ID || '',
  },
};

// Per-integration "is this live?" helpers. If MOCK_MODE is on, everything mocks.
export const isSerperLive = () => !config.mockMode && Boolean(config.serperApiKey);
export const isTwilioLive = () =>
  !config.mockMode && Boolean(config.twilio.accountSid && config.twilio.authToken);
export const isTelegramLive = () =>
  !config.mockMode && Boolean(config.telegram.botToken);
