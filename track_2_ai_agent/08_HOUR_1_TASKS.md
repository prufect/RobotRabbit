# Hour 1: Project Setup & Gemini Connection (0:00–1:00)

> [!IMPORTANT]
> **Executive Summary:** This hour establishes the entire project foundation — Node.js project initialization, dependency installation, environment configuration, the Vision System Prompt, Gemini 3.5 Flash API connectivity test, and a basic Express server with health check. Everything built in Hour 1 is the scaffolding for all subsequent hours.

---

## Time Budget

| Task | Time | Priority |
|------|------|----------|
| 1.1 Initialize Node.js Project | 5 min | 🔴 Critical |
| 1.2 Install Dependencies | 3 min | 🔴 Critical |
| 1.3 Environment Configuration | 5 min | 🔴 Critical |
| 1.4 Write the Vision System Prompt | 10 min | 🔴 Critical |
| 1.5 Test Gemini API Connection | 15 min | 🔴 Critical |
| 1.6 Create Basic Express Server | 10 min | 🔴 Critical |
| Buffer / troubleshooting | 12 min | — |
| **Total** | **60 min** | |

---

## Task 1.1: Initialize Node.js Project (~5 min)

### Create the project structure

```bash
# From the project root directory
mkdir -p src/routes src/services src/prompts src/utils src/mocks

# Initialize package.json
npm init -y
```

### Update `package.json`

```json
{
  "name": "maintenance-agent",
  "version": "1.0.0",
  "description": "AI-powered home maintenance agent — Track 2",
  "type": "module",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "test:gemini": "node src/utils/testGemini.js"
  },
  "keywords": ["ai", "maintenance", "gemini"],
  "license": "MIT"
}
```

> [!NOTE]
> We use `"type": "module"` to enable ES module `import/export` syntax throughout the project. This is required for `@google/generative-ai`.

### Final folder structure

```
maintenance-agent/
├── src/
│   ├── index.js              # Express server entry point
│   ├── routes/
│   │   ├── analyze.js         # POST /api/analyze
│   │   ├── contractorReply.js # POST /api/contractor-reply
│   │   └── status.js          # GET /api/status/:id
│   ├── services/
│   │   ├── visionService.js   # Gemini 3.5 Flash vision calls
│   │   ├── imageService.js    # Image fetch & base64
│   │   ├── stateManager.js    # Conversation state machine
│   │   ├── negotiationService.js
│   │   ├── contractorService.js
│   │   ├── notificationService.js
│   │   └── mockService.js     # Mock mode services
│   ├── prompts/
│   │   ├── visionPrompt.js    # Vision System Prompt
│   │   └── negotiationPrompt.js
│   ├── utils/
│   │   ├── retry.js           # Exponential backoff
│   │   └── testGemini.js      # API connectivity test
│   └── mocks/
│       ├── mockContractors.js
│       ├── mockReplies.js
│       ├── mockParsedQuotes.js
│       └── mockAnalysis.js
├── .env                       # API keys (gitignored)
├── .env.example               # Template for .env
├── .gitignore
└── package.json
```

---

## Task 1.2: Install Dependencies (~3 min)

```bash
# Production dependencies
npm install @google/generative-ai express cors dotenv node-fetch uuid

# Development dependencies
npm install --save-dev nodemon
```

| Package | Version | Purpose |
|---------|---------|---------|
| `@google/generative-ai` | latest | Gemini 3.5 Flash SDK |
| `express` | ^4.18 | HTTP server framework |
| `cors` | ^2.8 | Cross-origin resource sharing |
| `dotenv` | ^16.3 | Environment variable loading |
| `node-fetch` | ^3.3 | HTTP client for image fetching |
| `uuid` | ^9.0 | Unique conversation IDs |
| `nodemon` | ^3.0 | Auto-restart on file changes (dev only) |

---

## Task 1.3: Environment Configuration (~5 min)

### Create `.env`

```bash
# .env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
NODE_ENV=development
```

> [!CAUTION]
> **Get your Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey).** This is required before you can test anything. Do NOT share this key or commit it to git.

### Create `.env.example`

```bash
# .env.example — Copy this to .env and fill in your values
GEMINI_API_KEY=
PORT=3000
NODE_ENV=development
```

### Create `.gitignore`

```bash
# .gitignore
node_modules/
.env
*.log
```

---

## Task 1.4: Write the Vision System Prompt (~10 min)

Create the prompt file as defined in `02_PROMPT_ENGINEERING.md`:

```javascript
// src/prompts/visionPrompt.js

export const VISION_SYSTEM_PROMPT = `
You are an expert home maintenance technician with 20 years of experience. Your job is to analyze user-provided photos of broken or malfunctioning home appliances and equipment.

Rules:
1. You MUST respond with RAW JSON only. No markdown formatting. No conversational text. No code fences.
2. If the photo clearly shows a manufacturer label/sticker with a model number, set "isIdentified": true and extract the brand and model number.
3. If the photo is taken from too far away, the label is illegible, or no label is visible, set "isIdentified": false and ask the user to take a closer picture of the label in the "messageToUser" field.
4. Assess the urgency based on visible damage: "critical" for active hazards (sparks, flooding, gas smell mentioned), "high" for non-functional essential systems, "medium" for degraded performance, "low" for cosmetic issues.
5. Generate a specific contractor search query that would help find a specialist for this exact issue.

Expected JSON schema:
{
  "status": "success" | "error",
  "isIdentified": boolean,
  "category": "hvac" | "electrical" | "plumbing" | "unknown",
  "brand": string | null,
  "modelNumber": string | null,
  "messageToUser": string,
  "contractorSearchQuery": string | null,
  "urgencyLevel": "low" | "medium" | "high" | "critical",
  "issueDescription": string
}
`;
```

> [!TIP]
> **Test your prompt in [Google AI Studio](https://aistudio.google.com/)** before integrating it into code. Upload a test image and paste the prompt to verify JSON output quality.

---

## Task 1.5: Test Gemini API Connection (~15 min)

Create a standalone test script to verify the API key works and Gemini 3.5 Flash responds:

```javascript
// src/utils/testGemini.js

import { GoogleGenerativeAI } from '@google/generative-ai';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

async function testGeminiConnection() {
  console.log('🔑 Testing Gemini 3.5 Flash connection...\n');

  // 1. Check API key
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY is not set in .env');
    process.exit(1);
  }
  console.log('✅ GEMINI_API_KEY is configured');

  // 2. Initialize client
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

  // 3. Test text generation
  console.log('\n📝 Testing text generation...');
  try {
    const textResult = await model.generateContent('Reply with exactly: {"test": true}');
    console.log('   Response:', textResult.response.text().trim());
    console.log('✅ Text generation works');
  } catch (err) {
    console.error('❌ Text generation failed:', err.message);
    process.exit(1);
  }

  // 4. Test image analysis with a sample image
  console.log('\n🖼️  Testing image analysis...');
  try {
    const imageUrl = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/300px-PNG_transparency_demonstration_1.png';

    const response = await fetch(imageUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    const base64Data = buffer.toString('base64');

    const result = await model.generateContent([
      { text: 'Describe this image in one sentence. Reply with JSON: {"description": "..."}' },
      {
        inlineData: {
          mimeType: 'image/png',
          data: base64Data,
        },
      },
    ]);

    console.log('   Response:', result.response.text().trim());
    console.log('✅ Image analysis works');
  } catch (err) {
    console.error('❌ Image analysis failed:', err.message);
    console.error('   This may be a rate limit or API quota issue.');
  }

  console.log('\n🎉 All tests passed! Gemini 3.5 Flash is ready to use.');
}

testGeminiConnection().catch(console.error);
```

### Run the test

```bash
npm run test:gemini
```

### Expected output

```
🔑 Testing Gemini 3.5 Flash connection...

✅ GEMINI_API_KEY is configured

📝 Testing text generation...
   Response: {"test": true}
✅ Text generation works

🖼️  Testing image analysis...
   Response: {"description": "A pair of dice on a checkered background demonstrating PNG transparency."}
✅ Image analysis works

🎉 All tests passed! Gemini 3.5 Flash is ready to use.
```

### Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `API key not valid` | Invalid or expired key | Regenerate at [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `RESOURCE_EXHAUSTED` | Rate limit hit | Wait 60 seconds and retry |
| `model not found` | Incorrect model name | Verify you're using `gemini-3.5-flash` |
| `fetch is not defined` | Missing node-fetch | Run `npm install node-fetch` |
| `ERR_MODULE_NOT_FOUND` | Missing `"type": "module"` | Add to `package.json` |

---

## Task 1.6: Create Basic Express Server (~10 min)

```javascript
// src/index.js

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const startTime = Date.now();

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    activeConversations: 0,
  });
});

// Placeholder routes (to be built in Hours 2-3)
app.post('/api/analyze', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet', code: 'NOT_IMPLEMENTED' });
});

app.post('/api/contractor-reply', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet', code: 'NOT_IMPLEMENTED' });
});

app.get('/api/status/:conversationId', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet', code: 'NOT_IMPLEMENTED' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}`, code: 'NOT_FOUND' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
});

app.listen(PORT, () => {
  console.log(`\n🏠 Maintenance Agent API`);
  console.log(`   Port:    ${PORT}`);
  console.log(`   Mode:    ${process.env.NODE_ENV || 'production'}`);
  console.log(`   Gemini:  ${process.env.GEMINI_API_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   Health:  http://localhost:${PORT}/api/health\n`);
});
```

### Verify the server starts

```bash
npm run dev
```

```bash
# In another terminal
curl http://localhost:3000/api/health
```

Expected:
```json
{
  "status": "ok",
  "uptime": 3,
  "version": "1.0.0",
  "geminiConfigured": true,
  "activeConversations": 0
}
```

---

## Hour 1 Deliverables Checklist

- [ ] Node.js project initialized with `package.json` (`"type": "module"`)
- [ ] Folder structure created: `src/routes/`, `src/services/`, `src/prompts/`, `src/utils/`, `src/mocks/`
- [ ] All dependencies installed (`@google/generative-ai`, `express`, `cors`, `dotenv`, `node-fetch`, `uuid`, `nodemon`)
- [ ] `.env` file created with `GEMINI_API_KEY`, `PORT`, `NODE_ENV`
- [ ] `.env.example` and `.gitignore` created
- [ ] Vision System Prompt written in `src/prompts/visionPrompt.js`
- [ ] Gemini API connectivity test passes (`npm run test:gemini`)
- [ ] Express server starts on port 3000 (`npm run dev`)
- [ ] Health check endpoint returns valid JSON (`GET /api/health`)
- [ ] All placeholder routes return 501 (ready to implement in Hour 2)

> [!WARNING]
> **Do not proceed to Hour 2 until the Gemini API test passes.** If you can't connect to Gemini 3.5 Flash, all subsequent hours will be blocked. Troubleshoot connectivity issues now.
