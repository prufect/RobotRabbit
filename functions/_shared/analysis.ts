import type { NormalizedAnalysis } from './types.ts';

type RawAnalysis = Record<string, unknown>;

const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';

const VISION_SYSTEM_PROMPT = [
  'You are an expert home services identification agent.',
  'Analyze photos to determine what home service the user needs.',
  'This could be: appliance repair, painting, plumbing, electrical, roofing, carpentry, landscaping, cleaning, or any other home maintenance service.',
  '',
  'For the category field, use one of: "hvac", "electrical", "plumbing", "painting", "roofing", "carpentry", "landscaping", "cleaning", "appliance", "general", "other".',
  '',
  'CRITICAL RULES:',
  '- Do NOT default to "hvac" — look at what is ACTUALLY in the image.',
  '- If you see WOOD (damaged, rotting, scratched, warped), the category is "carpentry".',
  '- If you see PAINT (peeling, faded, stained walls/surfaces), the category is "painting".',
  '- If you see PIPES, WATER, or LEAKS, the category is "plumbing".',
  '- If you see WIRES, OUTLETS, or ELECTRICAL panels, the category is "electrical".',
  '- If you see ROOF damage, missing shingles, or gutters, the category is "roofing".',
  '- If you see PLANTS, YARD, LAWN, or GARDEN issues, the category is "landscaping".',
  '- If you see a DIRTY or MESSY area, the category is "cleaning".',
  '- Only use "hvac" if you SPECIFICALLY see an HVAC unit, air conditioner, furnace, or thermostat.',
  '- Only set brand and modelNumber when a specific manufactured appliance with visible branding is present.',
  '',
  'CONFIDENCE SCORING (CRITICAL):',
  '- You MUST return a "confidenceScore" from 0 to 100.',
  '- 100 = You are absolutely certain about the issue category and can describe the problem clearly.',
  '- 70-99 = You have a good idea but are not fully certain. Set isIdentified to false.',
  '- Below 70 = You cannot determine the issue. Set isIdentified to false.',
  '- Only set isIdentified to true when confidenceScore is exactly 100.',
  '- When confidenceScore < 100, you MUST provide a "clarifyingQuestion" — a specific question to ask the user to improve your understanding.',
  '- Do NOT guess or assume. If unsure, ask.',
  '',
  'CLARIFYING QUESTIONS:',
  '- Be specific: "Is this peeling paint on the wall, or water damage?" NOT "Can you tell me more?"',
  '- Reference what you see: "I can see what looks like a stain on the wall. Is this a water leak or discoloration?"',
  '- If the image is completely unclear: "I\'m having trouble identifying the issue in this photo. Could you describe what needs fixing, or take a closer photo of the problem area?"',
  '',
  'Return ONLY a JSON object with these fields:',
  '{ "isIdentified": boolean, "confidenceScore": number, "category": string, "brand": string|null, "modelNumber": string|null, "messageToUser": string, "contractorSearchQuery": string|null, "clarifyingQuestion": string|null }',
  '',
  'For contractorSearchQuery, create a search query that would find the RIGHT type of professional.',
  'Examples: "carpenter woodwork repair", "house painter contractor", "licensed plumber", "HVAC repair technician".',
  'Set contractorSearchQuery to null only when isIdentified is false.',
].join('\n');

const VISION_USER_PROMPT = 'Analyze this photo. What home service or repair does the user need? Identify the issue category, and if a specific appliance is visible, identify the brand and model. Look carefully at the actual content of the image — do not assume it is an HVAC unit. Return your confidence score (0-100) — only return 100 if you are absolutely certain.';

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
  const rawConfidence = typeof raw.confidenceScore === 'number' ? raw.confidenceScore : (typeof raw.confidence_score === 'number' ? raw.confidence_score : null);
  const confidenceScore = rawConfidence !== null ? Math.max(0, Math.min(100, Math.round(rawConfidence))) : (raw.isIdentified === true ? 100 : 50);
  const isIdentified = confidenceScore === 100;
  const category = stringOrNull(raw.category) ?? 'unknown';
  const brand = stringOrNull(raw.brand);
  const modelNumber = stringOrNull(raw.modelNumber) ?? stringOrNull(raw.model_name);
  const clarifyingQuestion = stringOrNull(raw.clarifyingQuestion) ?? stringOrNull(raw.clarifying_question) ?? null;
  const messageToUser = stringOrNull(raw.messageToUser)
    ?? stringOrNull(raw.message)
    ?? stringOrNull(raw.diagnosis)
    ?? (isIdentified
      ? 'I identified the item and will look for available contractors.'
      : 'I need a clearer photo or a little more detail to identify this item.');

  if (!isIdentified) {
    return {
      isIdentified: false,
      confidenceScore,
      status: 'needs_info',
      category,
      brand: null,
      modelNumber: null,
      diagnosis: null,
      nextQuestion: clarifyingQuestion ?? messageToUser,
      messageToUser,
      clarifyingQuestion,
      contractorSearchQuery: null,
    };
  }

  return {
    isIdentified: true,
    confidenceScore: 100,
    status: 'identified',
    category,
    brand,
    modelNumber,
    diagnosis: messageToUser,
    nextQuestion: null,
    messageToUser,
    clarifyingQuestion: null,
    contractorSearchQuery: searchQueryFrom(raw, category, brand, modelNumber),
  };
}

/**
 * Fetch an image URL and return its base64 representation and MIME type.
 */
async function fetchImageAsBase64(imageUrl: string): Promise<{ base64: string; mimeType: string }> {
  // Handle data: URLs directly
  if (imageUrl.startsWith('data:')) {
    const match = imageUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (match) {
      return { mimeType: match[1], base64: match[2] };
    }
    throw new Error('Invalid data URL format');
  }

  const response = await fetch(imageUrl, {
    headers: { 'Accept': 'image/*' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch image: HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? 'image/jpeg';
  const mimeType = contentType.split(';')[0].trim().toLowerCase();
  const arrayBuffer = await response.arrayBuffer();

  // Convert ArrayBuffer to base64 in Deno
  const uint8Array = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  const base64 = btoa(binary);

  return { base64, mimeType };
}

/**
 * Analyze an image using the Google Gemini Vision API directly.
 */
async function analyzeWithGemini(
  imageUrl: string,
  apiKey: string,
  model: string = DEFAULT_GEMINI_MODEL,
  userContext?: string,
): Promise<NormalizedAnalysis> {
  const { base64, mimeType } = await fetchImageAsBase64(imageUrl);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: VISION_SYSTEM_PROMPT }],
      },
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: userContext 
              ? `${VISION_USER_PROMPT}\n\nThe user also provided this additional context: "${userContext}"` 
              : VISION_USER_PROMPT },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini analysis failed: ${response.status} ${body}`);
  }

  const completion = await response.json();
  const content = completion?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof content !== 'string') {
    throw new Error('Gemini analysis returned no message content');
  }

  return normalizeAnalysis(parseJsonObject(content));
}

/**
 * Analyze an image using OpenRouter API (fallback).
 */
async function analyzeWithOpenRouter(
  imageUrl: string,
  apiKey: string,
  model: string = DEFAULT_OPENROUTER_MODEL,
  userContext?: string,
): Promise<NormalizedAnalysis> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://agentrabbit.local',
      'X-Title': 'AgentRabbit',
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content: VISION_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: userContext 
              ? `${VISION_USER_PROMPT}\n\nThe user also provided this additional context: "${userContext}"` 
              : VISION_USER_PROMPT },
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

/**
 * Main entry point for image analysis.
 * Tries Gemini first, then OpenRouter. No mock fallback.
 */
export async function analyzeRepairImage(
  imageUrl: string,
  options: {
    apiKey?: string;
    model?: string;
    geminiApiKey?: string;
    geminiModel?: string;
    userContext?: string;
  } = {},
): Promise<NormalizedAnalysis> {
  const errors: string[] = [];

  // Try Gemini Vision first (preferred)
  if (options.geminiApiKey) {
    try {
      return await analyzeWithGemini(
        imageUrl,
        options.geminiApiKey,
        options.geminiModel ?? DEFAULT_GEMINI_MODEL,
        options.userContext,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`Gemini: ${msg}`);
      console.error('Gemini analysis failed, trying OpenRouter fallback:', error);
    }
  }

  // Try OpenRouter as fallback
  if (options.apiKey) {
    try {
      return await analyzeWithOpenRouter(imageUrl, options.apiKey, options.model, options.userContext);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`OpenRouter: ${msg}`);
      console.error('OpenRouter analysis also failed:', error);
    }
  }

  // No mock fallback — throw an error so the frontend can handle it gracefully
  if (!options.geminiApiKey && !options.apiKey) {
    throw new Error('No vision API keys configured. Please set GEMINI_API_KEY or OPENROUTER_API_KEY.');
  }
  throw new Error(`Image analysis failed. ${errors.join('; ')}`);
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
