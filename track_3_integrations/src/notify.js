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
 * Low-level delivery: WhatsApp -> Telegram -> mock. Channel-aware: `build(channel)`
 * returns the message text formatted for that channel. Reused by outreach,
 * reminders, winner/decline messages — anything that sends to a contractor.
 *
 * @param {{name?:string, phone:string, telegramChatId?:string}} contractor
 * @param {(channel:string)=>string} build
 * @param {{mediaUrl?:string}} [extra]
 * @returns {Promise<{name:string, phone:string, ok:boolean, channel:string, id?:string}>}
 */
export async function deliver(contractor, build, extra = {}) {
  const base = { name: contractor.name, phone: contractor.phone };

  // 1) WhatsApp via Twilio
  if (isTwilioLive()) {
    try {
      const res = await getTwilioClient().messages.create({
        body: build('whatsapp'),
        from: config.twilio.from,
        to: `whatsapp:${contractor.phone}`,
        ...(extra.mediaUrl ? { mediaUrl: [extra.mediaUrl] } : {}),
      });
      return { ...base, ok: true, channel: 'whatsapp', id: res.sid };
    } catch (err) {
      console.error(`[notify] Twilio WhatsApp failed for ${contractor.phone}:`, err.message);
    }
  }

  // 2) Telegram fallback
  if (isTelegramLive()) {
    const chatId = contractor.telegramChatId || config.telegram.defaultChatId;
    if (chatId) {
      try {
        const { data } = await axios.post(
          `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`,
          { chat_id: chatId, text: build('telegram'), parse_mode: 'Markdown' },
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
  console.log(`To: ${contractor.name || '(unknown)'} <${contractor.phone}>`);
  console.log(build('whatsapp'));
  console.log('--------------------------------------------------------\n');
  return { ...base, ok: true, channel: 'mock' };
}

/**
 * Notify a single contractor with the job-request template.
 * @param {object} contractor
 * @param {object} issueDetails {category, brand, model, imageUrl, urgency}
 * @param {{locale?:string}} [opts]
 */
export function notifyContractor(contractor, issueDetails, opts = {}) {
  return deliver(
    contractor,
    (channel) => buildContractorMessage(contractor, issueDetails, { channel, locale: opts.locale }),
    { mediaUrl: issueDetails.imageUrl }
  );
}

/**
 * Notify a list of contractors in parallel.
 * @returns {Promise<{notifiedCount:number, results:Array, errors:Array}>}
 */
export async function notifyContractors(contractors, issueDetails, opts = {}) {
  const settled = await Promise.allSettled(
    contractors.map((c) => notifyContractor(c, issueDetails, opts))
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
