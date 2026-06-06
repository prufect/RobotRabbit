/**
 * POST /api/analyze-text — Text-based issue analysis endpoint.
 *
 * Uses Gemini to understand the user's free-text description and generate
 * a proper search query + category, instead of relying on brittle keyword matching.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../config.js';

const TEXT_ANALYSIS_PROMPT = `You are a home services assistant. The user has typed a free-text description of what they need help with.

Your job is to:
1. Understand the user's intent (what service they need).
2. Classify it into a category.
3. Generate a search query that would find the right professional on Google Maps / Google Places.
4. Write a short, friendly message to the user confirming you understood their request.
5. Determine the urgency level.

You MUST respond with ONLY valid JSON in this exact format, no markdown, no extra text:
{
  "category": "string — e.g. plumbing, hvac, electrical, painting, roofing, architecture, landscaping, carpentry, locksmith, cleaning, general",
  "urgency": "low | medium | high",
  "messageToUser": "string — friendly 1-2 sentence message confirming what you understood",
  "contractorSearchQuery": "string — a Google Maps search query to find the right professional, e.g. 'house painter contractor', 'residential architect', 'licensed plumber'"
}

Examples:
- "I need someone to paint my house" → { "category": "painting", "contractorSearchQuery": "house painter contractor", ... }
- "Looking for an architect to redesign my home" → { "category": "architecture", "contractorSearchQuery": "residential architect home design", ... }
- "My sink is leaking everywhere" → { "category": "plumbing", "contractorSearchQuery": "emergency plumber leak repair", "urgency": "high", ... }
- "Need someone to fix my roof" → { "category": "roofing", "contractorSearchQuery": "roof repair contractor", ... }

Be smart. Understand context. The search query should be specific enough to find the right professional.`;

export async function analyzeTextHandler(req, res, next) {
  try {
    const { transcript } = req.body;

    if (!transcript || typeof transcript !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required field: transcript',
      });
    }

    console.info(JSON.stringify({
      level: 'info',
      timestamp: new Date().toISOString(),
      requestId: req.id,
      message: 'Analyzing text input via Gemini',
      transcript: transcript.substring(0, 200),
    }));

    if (!config.GEMINI_API_KEY) {
      // Fallback to simple extraction if no API key
      return res.status(200).json(simpleFallback(transcript));
    }

    const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: config.GEMINI_MODEL });

    const result = await model.generateContent([
      { text: TEXT_ANALYSIS_PROMPT },
      { text: `User input: "${transcript}"` },
    ]);

    const responseText = result.response.text().trim();

    // Strip markdown fences if present
    const jsonStr = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.warn('Gemini returned non-JSON for text analysis, using fallback:', responseText);
      return res.status(200).json(simpleFallback(transcript));
    }

    return res.status(200).json({
      status: 'success',
      isIdentified: true,
      category: parsed.category || 'general',
      urgency: parsed.urgency || 'medium',
      messageToUser: parsed.messageToUser || "I'm looking into that for you.",
      contractorSearchQuery: parsed.contractorSearchQuery || transcript,
    });
  } catch (err) {
    console.error('analyzeText error:', err.message);
    // Don't crash — return a best-effort result using the raw transcript
    return res.status(200).json(simpleFallback(req.body?.transcript || ''));
  }
}

/**
 * Ultra-simple fallback: just use the user's own words as the search query.
 * This is better than the old keyword matching because it doesn't misclassify.
 */
function simpleFallback(transcript) {
  return {
    status: 'success',
    isIdentified: true,
    category: 'general',
    urgency: 'medium',
    messageToUser: "I'm looking into that for you. Searching for the right professionals nearby...",
    contractorSearchQuery: transcript.trim(),
  };
}
