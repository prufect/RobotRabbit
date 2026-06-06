# Hour 2: Image Analysis Endpoint & Contractor Search (1:00–2:00)

> [!IMPORTANT]
> **Executive Summary:** This hour builds the core agent functionality — the image processing service, Gemini 3.5 Flash vision integration, the `POST /api/analyze` endpoint, and the contractor search call (mocked initially). By the end of Hour 2, submitting a photo URL should return a full analysis and trigger contractor outreach.

---

## Time Budget

| Task | Time | Priority |
|------|------|----------|
| 2.1 Build Image Processing Service | 10 min | 🔴 Critical |
| 2.2 Build Vision Service | 15 min | 🔴 Critical |
| 2.3 Build POST /api/analyze Endpoint | 10 min | 🔴 Critical |
| 2.4 Test with Real Images | 10 min | 🟡 High |
| 2.5 Wire Up Contractor Search (Mock) | 15 min | 🔴 Critical |
| **Total** | **60 min** | |

---

## Task 2.1: Build the Image Processing Service (~10 min)

Create `src/services/imageService.js` as documented in `04_IMAGE_PROCESSING.md`:

```javascript
// src/services/imageService.js

import fetch from 'node-fetch';

const SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20 MB
const FETCH_TIMEOUT_MS = 10_000;

export async function fetchAndPrepareImage(imageUrl) {
  // Validate URL
  if (!imageUrl || typeof imageUrl !== 'string') {
    throw new Error('Image URL is required and must be a string');
  }

  try {
    new URL(imageUrl);
  } catch {
    throw new Error(`Invalid URL format: "${imageUrl}"`);
  }

  // Fetch with timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(imageUrl, { signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Image fetch timed out after ${FETCH_TIMEOUT_MS / 1000}s`);
    }
    throw new Error(`Failed to fetch image: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Image fetch failed: HTTP ${response.status}`);
  }

  // Validate MIME type
  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim();
  if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
    throw new Error(`Unsupported image format: "${mimeType}"`);
  }

  // Read and validate size
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) throw new Error('Image is empty (0 bytes)');
  if (buffer.length > MAX_IMAGE_SIZE) {
    throw new Error(`Image too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB (max 20MB)`);
  }

  return {
    base64Data: buffer.toString('base64'),
    mimeType,
  };
}
```

### Verification

```bash
# Quick test in Node REPL
node -e "
import('./src/services/imageService.js').then(m =>
  m.fetchAndPrepareImage('https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/300px-PNG_transparency_demonstration_1.png')
    .then(r => console.log('✅ MIME:', r.mimeType, 'Base64 length:', r.base64Data.length))
    .catch(e => console.error('❌', e.message))
);
"
```

---

## Task 2.2: Build the Vision Service (~15 min)

Create `src/services/visionService.js` as documented in `03_VISION_MODEL_INTEGRATION.md`:

```javascript
// src/services/visionService.js

import { GoogleGenerativeAI } from '@google/generative-ai';
import { VISION_SYSTEM_PROMPT } from '../prompts/visionPrompt.js';
import { fetchAndPrepareImage } from './imageService.js';
import { mockAnalyzeImage, isMockMode } from './mockService.js';
import { withRetry } from '../utils/retry.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: 'gemini-3.5-flash',
  generationConfig: {
    temperature: 0.1,
    topP: 0.95,
    maxOutputTokens: 1024,
  },
});

async function _analyzeImage(imageUrl) {
  const { base64Data, mimeType } = await fetchAndPrepareImage(imageUrl);

  const result = await model.generateContent([
    { text: VISION_SYSTEM_PROMPT },
    { text: 'Analyze this home maintenance issue from the photo.' },
    {
      inlineData: { mimeType, data: base64Data },
    },
  ]);

  const responseText = result.response.text();
  let cleaned = responseText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('Failed to parse Gemini response:', responseText);
    throw new Error('Gemini 3.5 Flash returned non-JSON response');
  }
}

export async function analyzeImage(imageUrl) {
  if (isMockMode()) {
    console.log('[MOCK] Using mock image analysis');
    return mockAnalyzeImage(imageUrl);
  }

  return withRetry(() => _analyzeImage(imageUrl), { maxRetries: 2 });
}
```

Also create the retry utility if not done:

```javascript
// src/utils/retry.js

export async function withRetry(fn, { maxRetries = 3, baseDelay = 1000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      console.warn(`Attempt ${attempt}/${maxRetries} failed: ${err.message}`);
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}
```

> [!WARNING]
> **Gemini 3.5 Flash has rate limits.** During testing, space out your requests by at least 2 seconds. If you hit `RESOURCE_EXHAUSTED`, wait 60 seconds before retrying.

---

## Task 2.3: Build POST /api/analyze Endpoint (~10 min)

```javascript
// src/routes/analyze.js

import { Router } from 'express';
import { analyzeImage } from '../services/visionService.js';
import { searchContractors } from '../services/contractorService.js';
import { createConversation, updateState } from '../services/stateManager.js';

export const analyzeRouter = Router();

analyzeRouter.post('/analyze', async (req, res) => {
  const { imageUrl, userId } = req.body;

  // Validate request
  if (!imageUrl) {
    return res.status(400).json({
      error: 'imageUrl is required',
      code: 'MISSING_IMAGE_URL',
    });
  }
  if (!userId) {
    return res.status(400).json({
      error: 'userId is required',
      code: 'MISSING_USER_ID',
    });
  }

  try {
    // Step 1: Analyze image with Gemini 3.5 Flash
    console.log(`[Analyze] Processing image for user ${userId}: ${imageUrl}`);
    const analysis = await analyzeImage(imageUrl);

    // Step 2: Create conversation
    const conversation = createConversation(analysis);
    console.log(`[Analyze] Created conversation ${conversation.id}`);

    // Step 3: Transition to SEARCHING_CONTRACTORS
    if (analysis.status === 'error' || analysis.category === 'unknown') {
      updateState(conversation.id, 'FAILED', {
        reason: 'Could not identify the appliance',
      });
      return res.status(422).json({
        conversationId: conversation.id,
        state: 'FAILED',
        analysis,
        error: 'Could not identify the appliance from the photo',
        code: 'ANALYSIS_FAILED',
      });
    }

    updateState(conversation.id, 'SEARCHING_CONTRACTORS');

    // Step 4: Search for contractors
    let contractors = [];
    try {
      contractors = await searchContractors(analysis.contractorSearchQuery);
      console.log(`[Analyze] Found ${contractors.length} contractors`);
    } catch (err) {
      console.error(`[Analyze] Contractor search failed: ${err.message}`);
    }

    if (contractors.length === 0) {
      updateState(conversation.id, 'FAILED', {
        reason: 'No contractors found for this repair type',
      });
      return res.status(200).json({
        conversationId: conversation.id,
        state: 'FAILED',
        analysis,
        contractorsContacted: 0,
        error: 'No contractors found',
      });
    }

    // Step 5: Transition to NEGOTIATING
    updateState(conversation.id, 'NEGOTIATING', { contractors });

    return res.status(201).json({
      conversationId: conversation.id,
      state: 'NEGOTIATING',
      analysis,
      contractorsContacted: contractors.length,
      createdAt: conversation.createdAt,
    });
  } catch (err) {
    console.error(`[Analyze] Error:`, err);

    if (err.message.includes('Unsupported image') || err.message.includes('too large') || err.message.includes('fetch failed')) {
      return res.status(422).json({
        error: err.message,
        code: 'IMAGE_PROCESSING_FAILED',
      });
    }

    return res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});
```

### Wire it up in `src/index.js`

Replace the placeholder route with the real one:

```javascript
// In src/index.js, replace the placeholder:
// app.post('/api/analyze', ...)

import { analyzeRouter } from './routes/analyze.js';
app.use('/api', analyzeRouter);
```

---

## Task 2.4: Test with Real Images (~10 min)

### Test 1: HVAC Unit

```bash
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "imageUrl": "https://example.com/photos/broken-hvac.jpg",
    "userId": "test_user"
  }'
```

**Expected:** `category: "hvac"`, `isIdentified: true/false`

### Test 2: Electrical Panel

```bash
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "imageUrl": "https://example.com/photos/electrical-panel.jpg",
    "userId": "test_user"
  }'
```

**Expected:** `category: "electrical"`

### Test 3: Non-Appliance (Should Return "unknown")

```bash
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Cat_November_2010-1a.jpg/220px-Cat_November_2010-1a.jpg",
    "userId": "test_user"
  }'
```

**Expected:** `category: "unknown"`, conversation transitions to `FAILED`

> [!TIP]
> **In mock mode** (`NODE_ENV=development`), all image analysis returns the Carrier HVAC mock response. Switch to `NODE_ENV=production` to test with real Gemini 3.5 Flash.

---

## Task 2.5: Wire Up Contractor Search (Mock) (~15 min)

```javascript
// src/services/contractorService.js

import fetch from 'node-fetch';
import { mockSearchContractors, isMockMode } from './mockService.js';

const TRACK_3_BASE_URL = process.env.TRACK_3_URL || 'http://localhost:8080';

export async function searchContractors(query) {
  if (isMockMode()) {
    console.log('[MOCK] Using mock contractor search');
    return mockSearchContractors(query);
  }

  try {
    const response = await fetch(`${TRACK_3_BASE_URL}/api/search-contractors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`Track 3 API returned HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.contractors || data;
  } catch (err) {
    console.error(`[ContractorService] Search failed: ${err.message}`);
    throw err;
  }
}
```

### Verify the Full Flow (Mock Mode)

```bash
# Ensure mock mode is active
NODE_ENV=development npm run dev

# Test the full analyze flow
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"imageUrl": "https://example.com/hvac.jpg", "userId": "test"}'
```

**Expected response:**
```json
{
  "conversationId": "...",
  "state": "NEGOTIATING",
  "analysis": {
    "category": "hvac",
    "brand": "Carrier",
    "modelNumber": "24ACC636A003"
  },
  "contractorsContacted": 3
}
```

---

## Hour 2 Deliverables Checklist

- [ ] `src/services/imageService.js` — fetches and validates images, converts to base64
- [ ] `src/services/visionService.js` — calls Gemini 3.5 Flash with image data
- [ ] `src/utils/retry.js` — exponential backoff retry utility
- [ ] `src/routes/analyze.js` — `POST /api/analyze` endpoint with full flow
- [ ] `src/services/contractorService.js` — contractor search (mock + real)
- [ ] Analyze endpoint wired into Express server
- [ ] Tested with at least 2 different image URLs
- [ ] Mock mode returns expected Carrier HVAC analysis
- [ ] Error cases handled: missing imageUrl, invalid URL, unidentifiable image
- [ ] Console logging shows the full flow: analyze → search → negotiate state

> [!IMPORTANT]
> **By the end of Hour 2**, calling `POST /api/analyze` should: analyze the image, create a conversation, search for contractors, and transition to `NEGOTIATING` state. If this doesn't work, debug before moving to Hour 3.
