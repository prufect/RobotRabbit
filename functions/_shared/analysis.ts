import type { NormalizedAnalysis } from './types.ts';

type RawAnalysis = Record<string, unknown>;

const DEFAULT_MODEL = 'openai/gpt-4o-mini';

export function parseJsonObject(text: string): Record<string, unknown> {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Model response did not contain a JSON object');
  }

  return JSON.parse(cleaned.slice(start, end + 1));
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function searchQueryFrom(raw: RawAnalysis, category: string, brand: string | null, modelNumber: string | null): string {
  const modelQuery = stringOrNull(raw.contractorSearchQuery) ?? stringOrNull(raw.contractor_search_query);
  if (modelQuery) return modelQuery;

  return [brand, modelNumber, category, 'repair']
    .filter(Boolean)
    .join(' ');
}

export function normalizeAnalysis(raw: RawAnalysis): NormalizedAnalysis {
  const isIdentified = raw.isIdentified === true || raw.status === 'identified';
  const category = stringOrNull(raw.category) ?? 'unknown';
  const brand = stringOrNull(raw.brand);
  const modelNumber = stringOrNull(raw.modelNumber) ?? stringOrNull(raw.model_name);
  const messageToUser = stringOrNull(raw.messageToUser)
    ?? stringOrNull(raw.message)
    ?? stringOrNull(raw.diagnosis)
    ?? (isIdentified
      ? 'I identified the item and will look for available contractors.'
      : 'I need a clearer photo or a little more detail to identify this item.');

  if (!isIdentified) {
    return {
      isIdentified: false,
      status: 'needs_info',
      category,
      brand: null,
      modelNumber: null,
      diagnosis: null,
      nextQuestion: messageToUser,
      messageToUser,
      contractorSearchQuery: null,
    };
  }

  return {
    isIdentified: true,
    status: 'identified',
    category,
    brand,
    modelNumber,
    diagnosis: messageToUser,
    nextQuestion: null,
    messageToUser,
    contractorSearchQuery: searchQueryFrom(raw, category, brand, modelNumber),
  };
}

export function createMockAnalysis(_imageUrl: string): NormalizedAnalysis {
  return normalizeAnalysis({
    isIdentified: true,
    category: 'hvac',
    brand: 'Carrier',
    modelNumber: 'Infinity 26',
    messageToUser: 'I identified a Carrier Infinity 26 HVAC unit. I will look for nearby HVAC repair contractors now.',
    contractorSearchQuery: 'Carrier Infinity 26 HVAC repair',
  });
}

export async function analyzeRepairImage(
  imageUrl: string,
  options: { apiKey?: string; model?: string } = {},
): Promise<NormalizedAnalysis> {
  if (!options.apiKey) {
    return createMockAnalysis(imageUrl);
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://agentrabbit.local',
      'X-Title': 'AgentRabbit',
    },
    body: JSON.stringify({
      model: options.model ?? DEFAULT_MODEL,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content: [
            'You identify home maintenance equipment from photos.',
            'Return only JSON with isIdentified, category, brand, modelNumber, messageToUser, contractorSearchQuery.',
            'If the image is insufficient, set isIdentified false and use messageToUser as the next question.',
          ].join(' '),
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this repair photo.' },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenRouter analysis failed: ${response.status} ${body}`);
  }

  const completion = await response.json();
  const content = completion?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('OpenRouter analysis returned no message content');
  }

  return normalizeAnalysis(parseJsonObject(content));
}

export function parseContractorReply(messageBody: string): {
  available: boolean;
  price: number | null;
  availability: string | null;
} {
  const lower = messageBody.toLowerCase();
  const available = !/(not available|unavailable|can't|cannot|no availability|booked)/.test(lower);
  const priceMatch = messageBody.match(/\$\s*(\d+(?:\.\d{1,2})?)/)
    ?? messageBody.match(/\b(\d{2,5})(?:\s*dollars|\s*usd)?\b/i);
  const availabilityMatch = messageBody.match(/(?:in|within)\s+\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?|days?)/i)
    ?? messageBody.match(/tomorrow(?:\s+\w+)?/i)
    ?? messageBody.match(/today(?:\s+\w+)?/i);

  return {
    available,
    price: priceMatch ? Number(priceMatch[1]) : null,
    availability: availabilityMatch ? availabilityMatch[0] : null,
  };
}
