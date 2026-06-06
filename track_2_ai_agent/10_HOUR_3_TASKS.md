# Hour 3: State Manager & Negotiation Engine (2:00–3:00)

> [!IMPORTANT]
> **Executive Summary:** This hour builds the agent's brain — the conversation state manager (in-memory store), the contractor reply webhook (`POST /api/contractor-reply`), and the Negotiation Parse Prompt that uses Gemini 3.5 Flash to extract structured quote data from natural-language contractor messages. By the end of Hour 3, the agent can receive and parse contractor replies.

---

## Time Budget

| Task | Time | Priority |
|------|------|----------|
| 3.1 Build the State Manager | 15 min | 🔴 Critical |
| 3.2 Write the Negotiation Parse Prompt | 10 min | 🔴 Critical |
| 3.3 Build the Negotiation Service | 15 min | 🔴 Critical |
| 3.4 Build POST /api/contractor-reply | 15 min | 🔴 Critical |
| 3.5 Test Contractor Reply Parsing | 5 min | 🟡 High |
| **Total** | **60 min** | |

---

## Task 3.1: Build the State Manager (~15 min)

Create `src/services/stateManager.js` as documented in `05_DECISION_TREE_LOGIC.md`:

```javascript
// src/services/stateManager.js

import { v4 as uuidv4 } from 'uuid';

const conversations = new Map();
const NEGOTIATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const QUOTE_THRESHOLD = 3;

export function createConversation(analysis, contractors = []) {
  const id = uuidv4();
  const conversation = {
    id,
    state: 'IMAGE_ANALYSIS',
    analysis,
    contractors,
    quotes: [],
    bestQuote: null,
    failureReason: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    negotiationStartedAt: null,
    timeoutHandle: null,
  };

  conversations.set(id, conversation);
  console.log(`[StateManager] Created conversation ${id}`);
  return conversation;
}

export function getConversation(id) {
  const conv = conversations.get(id);
  if (!conv) throw new Error(`Conversation not found: ${id}`);
  return conv;
}

export function updateState(id, newState, meta = {}) {
  const conv = getConversation(id);
  const oldState = conv.state;

  const validTransitions = {
    IMAGE_ANALYSIS:        ['SEARCHING_CONTRACTORS', 'FAILED'],
    SEARCHING_CONTRACTORS: ['NEGOTIATING', 'FAILED'],
    NEGOTIATING:           ['COMPLETED', 'FAILED'],
    COMPLETED:             [],
    FAILED:                [],
  };

  if (!validTransitions[oldState]?.includes(newState)) {
    throw new Error(`Invalid transition: ${oldState} → ${newState}`);
  }

  conv.state = newState;
  conv.updatedAt = new Date().toISOString();

  if (newState === 'NEGOTIATING') {
    conv.negotiationStartedAt = new Date().toISOString();
    startNegotiationTimeout(id);
  }

  if (newState === 'FAILED') {
    conv.failureReason = meta.reason || 'Unknown failure';
    clearNegotiationTimeout(conv);
  }

  if (newState === 'COMPLETED') {
    clearNegotiationTimeout(conv);
  }

  Object.assign(conv, meta);
  console.log(`[StateManager] ${id}: ${oldState} → ${newState}`);
  return conv;
}

export function addQuote(id, quote) {
  const conv = getConversation(id);

  if (conv.state !== 'NEGOTIATING') {
    console.warn(`[StateManager] Cannot add quote in state: ${conv.state}`);
    return { added: false, thresholdMet: false };
  }

  // Ignore duplicate replies
  if (conv.quotes.some(q => q.contractorName === quote.contractorName)) {
    console.warn(`[StateManager] Duplicate reply from ${quote.contractorName}`);
    return { added: false, thresholdMet: false, duplicate: true };
  }

  // Only count quotes with a price (not declines)
  if (!quote.isDeclined && quote.priceQuote !== null) {
    conv.quotes.push({ ...quote, receivedAt: new Date().toISOString() });
  } else {
    console.log(`[StateManager] ${quote.contractorName} declined or gave no price`);
  }

  conv.updatedAt = new Date().toISOString();

  return {
    added: true,
    thresholdMet: conv.quotes.length >= QUOTE_THRESHOLD,
    totalQuotes: conv.quotes.length,
  };
}

export function selectBestQuote(id, contractorRatings = {}) {
  const conv = getConversation(id);
  if (conv.quotes.length === 0) return null;

  const maxPrice = Math.max(...conv.quotes.map(q => q.priceQuote));
  let bestScore = -1;
  let bestQuote = null;

  for (const quote of conv.quotes) {
    const rating = contractorRatings[quote.contractorName] || 4.0;
    const priceScore = maxPrice > 0 ? 1 - (quote.priceQuote / maxPrice) : 0.5;
    const availScore = scoreAvailability(quote.availability);
    const ratingScore = rating / 5.0;
    const score = (priceScore * 0.60) + (availScore * 0.25) + (ratingScore * 0.15);

    quote.score = Math.round(score * 1000) / 1000;
    if (score > bestScore) {
      bestScore = score;
      bestQuote = quote;
    }
  }

  conv.bestQuote = bestQuote;
  conv.updatedAt = new Date().toISOString();
  console.log(`[StateManager] Best quote: ${bestQuote.contractorName} ($${bestQuote.priceQuote}, score: ${bestQuote.score})`);
  return bestQuote;
}

function scoreAvailability(availability) {
  if (!availability) return 0.4;
  const lower = availability.toLowerCase();
  if (lower.includes('today') || lower.includes('now')) return 1.0;
  if (lower.includes('tomorrow')) return 0.9;
  if (lower.includes('this week') || /\b(tue|wed|thu|fri)\w*\b/.test(lower)) return 0.7;
  if (lower.includes('next week') || lower.includes('next monday')) return 0.5;
  if (lower.includes('two weeks') || lower.includes('2 weeks')) return 0.3;
  return 0.4;
}

function startNegotiationTimeout(id) {
  const conv = conversations.get(id);
  if (!conv) return;

  conv.timeoutHandle = setTimeout(() => {
    const c = conversations.get(id);
    if (c && c.state === 'NEGOTIATING') {
      console.log(`[StateManager] Negotiation timeout for ${id}`);
      if (c.quotes.length > 0) {
        selectBestQuote(id);
        updateState(id, 'COMPLETED', { reason: 'Timeout — selected best available' });
      } else {
        updateState(id, 'FAILED', { reason: 'Timeout — no valid quotes received' });
      }
    }
  }, NEGOTIATION_TIMEOUT_MS);
}

function clearNegotiationTimeout(conv) {
  if (conv.timeoutHandle) {
    clearTimeout(conv.timeoutHandle);
    conv.timeoutHandle = null;
  }
}

export function getConversationView(id) {
  const conv = getConversation(id);
  return {
    id: conv.id,
    state: conv.state,
    analysis: conv.analysis,
    quotes: conv.quotes,
    bestQuote: conv.bestQuote,
    failureReason: conv.failureReason,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
  };
}

export function getActiveConversationCount() {
  return conversations.size;
}
```

### Verify the State Manager

```bash
# Quick inline test
node -e "
import { createConversation, updateState, addQuote, selectBestQuote, getConversationView } from './src/services/stateManager.js';

const conv = createConversation({ category: 'hvac', brand: 'Carrier' });
updateState(conv.id, 'SEARCHING_CONTRACTORS');
updateState(conv.id, 'NEGOTIATING');

addQuote(conv.id, { contractorName: 'Mike', priceQuote: 385, availability: 'Thursday', isDeclined: false });
addQuote(conv.id, { contractorName: 'CoolAir', priceQuote: 450, availability: 'Next Monday', isDeclined: false });

const best = selectBestQuote(conv.id, { 'Mike': 4.8, 'CoolAir': 4.5 });
console.log('Best:', best.contractorName, '$' + best.priceQuote, 'Score:', best.score);
console.log('View:', JSON.stringify(getConversationView(conv.id), null, 2));
"
```

---

## Task 3.2: Write the Negotiation Parse Prompt (~10 min)

Create `src/prompts/negotiationPrompt.js` as documented in `02_PROMPT_ENGINEERING.md` Section 2:

```javascript
// src/prompts/negotiationPrompt.js

export const NEGOTIATION_PARSE_PROMPT = `
You are a data extraction assistant. Your job is to parse a contractor's natural-language reply to a home repair inquiry and extract structured data.

Rules:
1. You MUST respond with RAW JSON only. No markdown formatting. No conversational text.
2. Extract the price as a number (no currency symbols). If no price is mentioned, set "priceQuote" to null.
3. If the contractor declines the job, set "isDeclined" to true.
4. If the contractor offers a different price than what was asked, capture it in "counterOffer".
5. Extract availability as a human-readable string (e.g., "Thursday or Friday this week").
6. Capture any important notes, warranties, or conditions in the "notes" field.

Expected JSON schema:
{
  "contractorName": string,
  "priceQuote": number | null,
  "currency": "USD",
  "availability": string | null,
  "isDeclined": boolean,
  "counterOffer": number | null,
  "notes": string
}
`;
```

> [!TIP]
> **This prompt is ~150 tokens** — very fast for Gemini 3.5 Flash. Parsing a contractor reply should take under 1 second.

---

## Task 3.3: Build the Negotiation Service (~15 min)

```javascript
// src/services/negotiationService.js

import { GoogleGenerativeAI } from '@google/generative-ai';
import { NEGOTIATION_PARSE_PROMPT } from '../prompts/negotiationPrompt.js';
import { mockParseContractorReply, isMockMode } from './mockService.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: 'gemini-3.5-flash',
  generationConfig: {
    temperature: 0.1,
    maxOutputTokens: 512,
  },
});

async function _parseContractorReply(message, contractorName) {
  const prompt = `${NEGOTIATION_PARSE_PROMPT}

Contractor name: ${contractorName}
Contractor's reply: "${message}"

Extract the structured data:`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();

  let cleaned = responseText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  }

  try {
    const parsed = JSON.parse(cleaned);
    parsed.contractorName = parsed.contractorName || contractorName;
    return parsed;
  } catch (err) {
    console.error(`Failed to parse negotiation response for ${contractorName}:`, responseText);
    // Graceful fallback — never crash on unparseable replies
    return {
      contractorName,
      priceQuote: null,
      currency: 'USD',
      availability: null,
      isDeclined: false,
      counterOffer: null,
      notes: `Unparseable reply: ${message}`,
    };
  }
}

export async function parseContractorReply(message, contractorName) {
  if (isMockMode()) {
    return mockParseContractorReply(message, contractorName);
  }
  return _parseContractorReply(message, contractorName);
}
```

---

## Task 3.4: Build POST /api/contractor-reply Webhook (~15 min)

```javascript
// src/routes/contractorReply.js

import { Router } from 'express';
import { parseContractorReply } from '../services/negotiationService.js';
import { getConversation, addQuote, selectBestQuote, updateState } from '../services/stateManager.js';

export const contractorReplyRouter = Router();

contractorReplyRouter.post('/contractor-reply', async (req, res) => {
  const { conversationId, contractorId, contractorName, message } = req.body;

  // Validate required fields
  if (!conversationId || !contractorId || !contractorName || !message) {
    return res.status(400).json({
      error: 'Missing required fields: conversationId, contractorId, contractorName, message',
      code: 'MISSING_FIELDS',
    });
  }

  // Check conversation exists
  let conversation;
  try {
    conversation = getConversation(conversationId);
  } catch (err) {
    return res.status(404).json({
      error: `Conversation not found: ${conversationId}`,
      code: 'CONVERSATION_NOT_FOUND',
    });
  }

  // Check conversation is in NEGOTIATING state
  if (conversation.state !== 'NEGOTIATING') {
    return res.status(409).json({
      error: `Conversation is in "${conversation.state}" state, not NEGOTIATING`,
      code: 'INVALID_STATE',
    });
  }

  try {
    // Step 1: Parse the contractor's reply with Gemini 3.5 Flash
    console.log(`[ContractorReply] Parsing reply from ${contractorName}`);
    const quoteParsed = await parseContractorReply(message, contractorName);
    console.log(`[ContractorReply] Parsed:`, JSON.stringify(quoteParsed));

    // Step 2: Add quote to conversation
    const { added, thresholdMet, totalQuotes, duplicate } = addQuote(conversationId, quoteParsed);

    if (duplicate) {
      return res.status(409).json({
        error: `Duplicate reply from ${contractorName}`,
        code: 'DUPLICATE_REPLY',
      });
    }

    // Step 3: If threshold met, select best quote and complete
    const responseData = {
      received: true,
      quoteParsed,
      totalQuotes: totalQuotes || 0,
      thresholdMet: thresholdMet || false,
    };

    if (thresholdMet) {
      // Build ratings map from contractor data
      const ratings = {};
      if (conversation.contractors) {
        conversation.contractors.forEach(c => {
          ratings[c.name] = c.rating;
        });
      }

      const bestQuote = selectBestQuote(conversationId, ratings);
      updateState(conversationId, 'COMPLETED');

      responseData.bestQuote = bestQuote;
      responseData.conversationState = 'COMPLETED';

      console.log(`[ContractorReply] Threshold met! Best: ${bestQuote?.contractorName} ($${bestQuote?.priceQuote})`);

      // TODO: Notify user (Hour 4)
    }

    return res.status(200).json(responseData);
  } catch (err) {
    console.error(`[ContractorReply] Error:`, err);
    return res.status(500).json({
      error: 'Failed to process contractor reply',
      code: 'PARSE_ERROR',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});
```

### Wire it up in `src/index.js`

```javascript
import { contractorReplyRouter } from './routes/contractorReply.js';
app.use('/api', contractorReplyRouter);
```

Also add the status route:

```javascript
// src/routes/status.js

import { Router } from 'express';
import { getConversationView } from '../services/stateManager.js';

export const statusRouter = Router();

statusRouter.get('/status/:conversationId', (req, res) => {
  try {
    const view = getConversationView(req.params.conversationId);
    return res.json(view);
  } catch (err) {
    return res.status(404).json({
      error: err.message,
      code: 'CONVERSATION_NOT_FOUND',
    });
  }
});
```

```javascript
import { statusRouter } from './routes/status.js';
app.use('/api', statusRouter);
```

---

## Task 3.5: Test Contractor Reply Parsing (~5 min)

> [!TIP]
> Test each contractor reply independently to verify the parse prompt works correctly. Use mock mode first, then switch to real Gemini 3.5 Flash.

### Test with Mock Data

First, run the analyze endpoint to get a conversation ID, then send replies:

```bash
# Step 1: Get a conversation ID
CONV_ID=$(curl -s -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"imageUrl": "https://example.com/hvac.jpg", "userId": "test"}' \
  | python3 -c "import sys, json; print(json.load(sys.stdin)['conversationId'])")

echo "Conversation ID: $CONV_ID"

# Step 2: Send Mike's reply
curl -s -X POST http://localhost:3000/api/contractor-reply \
  -H "Content-Type: application/json" \
  -d "{
    \"conversationId\": \"$CONV_ID\",
    \"contractorId\": \"contractor_mike_001\",
    \"contractorName\": \"Mike's HVAC Solutions\",
    \"message\": \"I can do it for \$385. Available Thursday or Friday.\"
  }" | python3 -m json.tool

# Step 3: Send CoolAir's reply
curl -s -X POST http://localhost:3000/api/contractor-reply \
  -H "Content-Type: application/json" \
  -d "{
    \"conversationId\": \"$CONV_ID\",
    \"contractorId\": \"contractor_coolair_002\",
    \"contractorName\": \"CoolAir Pros\",
    \"message\": \"Our rate would be \$450. Earliest availability is next Monday.\"
  }" | python3 -m json.tool

# Step 4: Check status
curl -s http://localhost:3000/api/status/$CONV_ID | python3 -m json.tool
```

### Expected Parse Results

| Contractor | priceQuote | availability | isDeclined |
|-----------|-----------|-------------|-----------|
| Mike's HVAC Solutions | 385 | Thursday or Friday this week | false |
| CoolAir Pros | 450 | Next Monday | false |

---

## Hour 3 Deliverables Checklist

- [ ] `src/services/stateManager.js` — full state machine with all 5 states
- [ ] State transitions validated (invalid transitions throw errors)
- [ ] `src/prompts/negotiationPrompt.js` — parse prompt for Gemini 3.5 Flash
- [ ] `src/services/negotiationService.js` — parses contractor replies into JSON
- [ ] `src/routes/contractorReply.js` — `POST /api/contractor-reply` webhook
- [ ] `src/routes/status.js` — `GET /api/status/:conversationId`
- [ ] Duplicate reply detection working
- [ ] Declined quotes excluded from valid quote count
- [ ] 5-minute negotiation timeout configured
- [ ] All three routes wired into Express server
- [ ] Tested parsing with Mike's HVAC and CoolAir Pros mock messages
- [ ] Console logs show state transitions clearly

> [!WARNING]
> **The `addQuote` function must handle edge cases gracefully** — duplicate replies, declined quotes, missing prices. Don't let any of these crash the server. Test each edge case before moving to Hour 4.
