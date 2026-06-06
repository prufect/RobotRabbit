// Message templates sent to contractors. Track 3 owns the exact wording.
// Keep WhatsApp markdown (*bold*) — Telegram falls back to plain-ish text.

const URGENCY_LABEL = {
  high: '🚨 URGENT — needs service today',
  medium: '⚠️ Needs service soon (within a couple of days)',
  low: 'Flexible timing',
};

function urgencyLine(urgency = 'medium') {
  return URGENCY_LABEL[String(urgency).toLowerCase()] || URGENCY_LABEL.medium;
}

/**
 * Build the outreach message for a contractor.
 * @param {{name?:string}} contractor
 * @param {{category?:string, brand?:string, model?:string, imageUrl?:string, urgency?:string}} issue
 */
export function buildContractorMessage(contractor, issue) {
  const greeting = contractor?.name ? `Hi ${contractor.name},` : 'Hi,';
  const item = [issue.brand, issue.model].filter(Boolean).join(' ') || issue.category || 'a home appliance';

  const lines = [
    `${greeting}`,
    '',
    '🛠️ *New Job Request* from a homeowner',
    '',
    `*Issue:* ${item}`,
    issue.category ? `*Type:* ${issue.category}` : null,
    `*Urgency:* ${urgencyLine(issue.urgency)}`,
    issue.imageUrl ? `*Photo:* ${issue.imageUrl}` : null,
    '',
    "Reply *YES* if you're available, along with your call-out fee (e.g. \"YES, $150, can be there in 1 hour\").",
  ].filter((l) => l !== null);

  return lines.join('\n');
}

export { urgencyLine };
