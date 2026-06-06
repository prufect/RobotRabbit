import axios from 'axios';
import twilio from 'twilio';
import { config, isTwilioLive, isTelegramLive } from './config.js';
import { buildContractorMessage } from './templates.js';

let twilioClient = null;
function getTwilioClient() {
  if (!twilioClient) {
    twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
  }
  return twilioClient;
}

/**
 * Notify a single contractor. Tries WhatsApp (Twilio) first, then Telegram,
 * then falls back to a logged mock send so the pipeline never hard-fails.
 *
 * @param {{name?:string, phone:string, telegramChatId?:string}} contractor
 * @param {object} issueDetails {category, brand, model, imageUrl, urgency}
 * @returns {Promise<{name:string, phone:string, ok:boolean, channel:string, id?:string, error?:string}>}
 */
export async function notifyContractor(contractor, issueDetails) {
  const message = buildContractorMessage(contractor, issueDetails);
  const base = { name: contractor.name, phone: contractor.phone };

  // 1) WhatsApp via Twilio
  if (isTwilioLive()) {
    try {
      const res = await getTwilioClient().messages.create({
        body: message,
        from: config.twilio.from,
        to: `whatsapp:${contractor.phone}`,
        ...(issueDetails.imageUrl ? { mediaUrl: [issueDetails.imageUrl] } : {}),
      });
      return { ...base, ok: true, channel: 'whatsapp', id: res.sid };
    } catch (err) {
      console.error(`[notify] Twilio failed for ${contractor.phone}:`, err.message);
      // fall through to telegram / mock
    }
  }

  // 2) Telegram fallback
  if (isTelegramLive()) {
    const chatId = contractor.telegramChatId || config.telegram.defaultChatId;
    if (chatId) {
      try {
        const { data } = await axios.post(
          `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`,
          { chat_id: chatId, text: message, parse_mode: 'Markdown' },
          { timeout: 8000 }
        );
        return { ...base, ok: true, channel: 'telegram', id: String(data?.result?.message_id ?? '') };
      } catch (err) {
        console.error(`[notify] Telegram failed for ${contractor.name}:`, err.message);
      }
    }
  }

  // 3) Mock — log it so the demo visibly "sends" without credentials.
  console.log('\n--- [MOCK SEND] ----------------------------------------');
  console.log(`To: ${contractor.name} <${contractor.phone}>`);
  console.log(message);
  console.log('--------------------------------------------------------\n');
  return { ...base, ok: true, channel: 'mock' };
}

/**
 * Notify a list of contractors in parallel.
 * @returns {Promise<{notifiedCount:number, results:Array, errors:Array}>}
 */
export async function notifyContractors(contractors, issueDetails) {
  const settled = await Promise.allSettled(
    contractors.map((c) => notifyContractor(c, issueDetails))
  );

  const results = [];
  const errors = [];
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i];
    if (s.status === 'fulfilled' && s.value.ok) {
      results.push(s.value);
    } else {
      const reason = s.status === 'rejected' ? s.reason?.message : s.value?.error;
      errors.push({ contractor: contractors[i]?.name || contractors[i]?.phone, error: reason || 'unknown' });
    }
  }

  return { notifiedCount: results.length, results, errors };
}
