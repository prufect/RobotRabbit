// Message templates sent to contractors and homeowners. Track 3 owns wording.
//
// Templates are aware of:
//   - channel: 'whatsapp' | 'telegram' | 'sms'  (controls formatting)
//   - locale:  'en' | 'es'                        (language)
//   - category: 'hvac' | 'electrical' | 'plumbing' | ... (tailored intro)

const URGENCY = {
  en: {
    high: '🚨 URGENT — needs service today',
    medium: '⚠️ Needs service soon (within a couple of days)',
    low: 'Flexible timing',
  },
  es: {
    high: '🚨 URGENTE — necesita servicio hoy',
    medium: '⚠️ Necesita servicio pronto (en un par de días)',
    low: 'Horario flexible',
  },
};

// Category-specific framing so the outreach reads like a human dispatcher.
const CATEGORY_INTRO = {
  en: {
    hvac: 'an HVAC / cooling issue',
    electrical: 'an electrical panel issue',
    plumbing: 'a plumbing issue',
    default: 'a home repair',
  },
  es: {
    hvac: 'un problema de climatización (HVAC)',
    electrical: 'un problema en el panel eléctrico',
    plumbing: 'un problema de plomería',
    default: 'una reparación del hogar',
  },
};

function pick(map, locale, key, fallbackKey = 'default') {
  const byLocale = map[locale] || map.en;
  return byLocale[key] || byLocale[fallbackKey];
}

// Channel-tuned formatting. WhatsApp/Telegram render *bold*; SMS goes plain.
function bold(text, channel) {
  return channel === 'sms' ? text : `*${text}*`;
}
function supportsEmoji(channel) {
  return channel !== 'sms'; // keep SMS lean & deliverable
}

function itemLabel(issue) {
  return [issue.brand, issue.model].filter(Boolean).join(' ') || issue.category || 'a home appliance';
}

/**
 * Outreach message asking a contractor for availability + price.
 * @param {{name?:string}} contractor
 * @param {object} issue {category, brand, model, imageUrl, urgency}
 * @param {{channel?:string, locale?:string}} opts
 */
export function buildContractorMessage(contractor, issue = {}, opts = {}) {
  const { channel = 'whatsapp', locale = 'en' } = opts;
  const name = contractor?.name;
  const item = itemLabel(issue);
  const urgency = pick(URGENCY, locale, String(issue.urgency || 'medium').toLowerCase());
  const catIntro = pick(CATEGORY_INTRO, locale, issue.category);
  const flame = supportsEmoji(channel) ? '🛠️ ' : '';

  if (locale === 'es') {
    return [
      name ? `Hola ${name},` : 'Hola,',
      '',
      `${flame}${bold('Nueva solicitud de trabajo', channel)} de un propietario sobre ${catIntro}.`,
      '',
      `${bold('Problema:', channel)} ${item}`,
      issue.category ? `${bold('Tipo:', channel)} ${issue.category}` : null,
      `${bold('Urgencia:', channel)} ${urgency}`,
      issue.imageUrl ? `${bold('Foto:', channel)} ${issue.imageUrl}` : null,
      '',
      `Responda ${bold('SÍ', channel)} si está disponible, junto con su tarifa (ej. "SÍ, $150, llego en 1 hora").`,
    ].filter((l) => l !== null).join('\n');
  }

  return [
    name ? `Hi ${name},` : 'Hi,',
    '',
    `${flame}${bold('New Job Request', channel)} from a homeowner about ${catIntro}.`,
    '',
    `${bold('Issue:', channel)} ${item}`,
    issue.category ? `${bold('Type:', channel)} ${issue.category}` : null,
    `${bold('Urgency:', channel)} ${urgency}`,
    issue.imageUrl ? `${bold('Photo:', channel)} ${issue.imageUrl}` : null,
    '',
    `Reply ${bold('YES', channel)} if you're available, with your call-out fee (e.g. "YES, $150, there in 1 hour").`,
  ].filter((l) => l !== null).join('\n');
}

/** Gentle nudge if a contractor hasn't replied yet. */
export function buildReminderMessage(contractor, issue = {}, opts = {}) {
  const { channel = 'whatsapp', locale = 'en' } = opts;
  const item = itemLabel(issue);
  if (locale === 'es') {
    return `Hola${contractor?.name ? ` ${contractor.name}` : ''}, ¿sigue disponible para el trabajo de ${item}? El propietario está esperando — responda ${bold('SÍ', channel)} con su tarifa.`;
  }
  return `Hi${contractor?.name ? ` ${contractor.name}` : ''}, just following up on the ${item} job — the homeowner is waiting. Reply ${bold('YES', channel)} with your call-out fee if you can take it.`;
}

/** Sent to the contractor who wins the booking. */
export function buildWinnerMessage(contractor, issue = {}, opts = {}) {
  const { channel = 'whatsapp', locale = 'en' } = opts;
  const item = itemLabel(issue);
  const party = supportsEmoji(channel) ? ' 🎉' : '';
  if (locale === 'es') {
    return `¡Felicidades${contractor?.name ? ` ${contractor.name}` : ''}!${party} Tiene el trabajo de ${item}. El propietario lo espera. Le compartiremos los datos de contacto en breve.`;
  }
  return `Congrats${contractor?.name ? ` ${contractor.name}` : ''}!${party} You've got the ${item} job. The homeowner is expecting you — we'll share contact details shortly.`;
}

/** Sent to contractors who replied but didn't win. */
export function buildDeclineMessage(contractor, issue = {}, opts = {}) {
  const { locale = 'en' } = opts;
  const item = itemLabel(issue);
  if (locale === 'es') {
    return `Gracias${contractor?.name ? ` ${contractor.name}` : ''} por su respuesta sobre el trabajo de ${item}. El propietario eligió a otro proveedor esta vez. ¡Le contactaremos en el futuro!`;
  }
  return `Thanks${contractor?.name ? ` ${contractor.name}` : ''} for responding on the ${item} job. The homeowner went with another provider this time — we'll keep you in mind for next time!`;
}

export { URGENCY };
