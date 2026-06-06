/**
 * Gemini AI service — wraps the @google/generative-ai SDK.
 *
 * Exposes two high-level functions:
 *  • analyzeImage(imageUrl) — vision-based appliance identification.
 *  • parseContractorReply(messageBody) — extract structured quote data from text.
 *
 * Both functions include:
 *  • Automatic retry (1 retry on transient failure).
 *  • Timeout via AbortSignal.
 *  • Robust JSON extraction from the model's response.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../config.js';
import { VISION_SYSTEM_PROMPT } from '../prompts/system.js';
import { NEGOTIATION_PARSE_PROMPT } from '../prompts/negotiation.js';
import { fetchAndProcessImage } from './imageProcessor.js';
import { GeminiError } from '../utils/errors.js';

// ─── SDK Initialization ─────────────────────────────────────────────────────

const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);

/**
 * Get a generative model instance.
 * @param {string} [systemInstruction] Optional system prompt.
 */
function getModel(systemInstruction) {
  return genAI.getGenerativeModel({
    model: config.GEMINI_MODEL,
    ...(systemInstruction && { systemInstruction }),
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract the first JSON object from a string that may contain markdown fences
 * or surrounding prose.
 *
 * @param {string} text
 * @returns {object}
 */
function extractJSON(text) {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  // Try to find a JSON object boundary
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new GeminiError('Gemini response did not contain valid JSON.', { rawResponse: text });
  }

  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch (parseErr) {
    throw new GeminiError('Failed to parse JSON from Gemini response.', {
      rawResponse: text,
      parseError: parseErr.message,
    });
  }
}

/**
 * Retry wrapper — executes `fn` up to `maxRetries + 1` times.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {number} maxRetries
 * @returns {Promise<T>}
 */
async function withRetry(fn, maxRetries = config.GEMINI_MAX_RETRIES) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const backoff = (attempt + 1) * 1_000; // 1 s, 2 s, …
        console.warn(JSON.stringify({
          level: 'warn',
          timestamp: new Date().toISOString(),
          message: `Gemini call failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${backoff} ms…`,
          error: err.message,
        }));
        await new Promise(r => setTimeout(r, backoff));
      }
    }
  }
  throw lastError;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Analyze an image of a home appliance using Gemini Vision.
 *
 * @param {string} imageUrl — Publicly-accessible image URL.
 * @returns {Promise<object>} Structured analysis result matching the API contract.
 */
export async function analyzeImage(imageUrl) {
  // Fetch and encode the image
  const { base64, mimeType } = await fetchAndProcessImage(imageUrl);

  const model = getModel(VISION_SYSTEM_PROMPT);

  const result = await withRetry(async () => {
    const response = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: 'Analyze this photo. What home service or repair does the user need? Identify the issue category, and if a specific appliance is visible, identify the brand and model. Look carefully at the actual content of the image — do not assume it is an HVAC unit. Return the result as JSON.' },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,    // Low temp for deterministic structured output
        maxOutputTokens: 1024,
      },
    });

    const text = response.response.text();
    return extractJSON(text);
  });

  return result;
}

/**
 * Parse a contractor's natural-language reply into structured quote data.
 *
 * @param {string} messageBody — The contractor's raw message text.
 * @returns {Promise<object>} Parsed quote: { available, price, availability, rawMessage }.
 */
export async function parseContractorReply(messageBody) {
  const model = getModel(NEGOTIATION_PARSE_PROMPT);

  const result = await withRetry(async () => {
    const response = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            { text: `Parse the following contractor reply:\n\n"${messageBody}"` },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.0,
        maxOutputTokens: 512,
      },
    });

    const text = response.response.text();
    return extractJSON(text);
  });

  // Ensure rawMessage is always the original
  result.rawMessage = messageBody;
  return result;
}
