# Hour 5: Testing, Hardening & Demo Prep (4:00–5:00)

> [!IMPORTANT]
> **Executive Summary:** The final hour is dedicated to end-to-end testing with the real Gemini 3.5 Flash API, error handling hardening, performance validation, cross-track integration with Track 1 (frontend) and Track 3 (integrations), and rehearsing the demo. This is the polish hour — no new features, only reliability and presentation.

---

## Time Budget

| Task | Time | Priority |
|------|------|----------|
| 5.1 End-to-End Testing with Real Gemini | 15 min | 🔴 Critical |
| 5.2 Error Handling Hardening | 10 min | 🟡 High |
| 5.3 Add Health Check Enhancements | 5 min | 🟢 Medium |
| 5.4 Performance Validation | 5 min | 🟡 High |
| 5.5 Cross-Track Integration | 10 min | 🔴 Critical |
| 5.6 Demo Rehearsal | 15 min | 🔴 Critical |
| **Total** | **60 min** | |

---

## Task 5.1: End-to-End Testing with Real Gemini API (~15 min)

Switch from mock mode to real Gemini 3.5 Flash and test the full pipeline.

### Switch to Production Mode

```bash
# Update .env
NODE_ENV=production

# Restart server
npm run dev
```

### Test 1: HVAC Unit Photo

```bash
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Rooftop_Heating_Ventilation_Air_Conditioning_%28HVAC%29_unit.jpg/640px-Rooftop_Heating_Ventilation_Air_Conditioning_%28HVAC%29_unit.jpg",
    "userId": "test_real_1"
  }' | python3 -m json.tool
```

**Verify:**
- [ ] `category` is `"hvac"`
- [ ] `status` is `"success"`
- [ ] `contractorSearchQuery` is a reasonable search string
- [ ] Response time < 5 seconds

### Test 2: Electrical Panel Photo

```bash
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/US_wiring_basement-panel.jpg/440px-US_wiring_basement-panel.jpg",
    "userId": "test_real_2"
  }' | python3 -m json.tool
```

**Verify:**
- [ ] `category` is `"electrical"`

### Test 3: Ambiguous / Non-Appliance Photo

```bash
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Cat_November_2010-1a.jpg/220px-Cat_November_2010-1a.jpg",
    "userId": "test_real_3"
  }' | python3 -m json.tool
```

**Verify:**
- [ ] `category` is `"unknown"` and conversation state is `FAILED`

### Document Gemini Quirks

> [!NOTE]
> Keep notes on any unexpected Gemini 3.5 Flash behavior:
> - Does it sometimes wrap JSON in markdown fences? (The parser handles this)
> - Does it add conversational text before/after JSON? (The parser strips this)
> - Are there model-specific latency patterns?

---

## Task 5.2: Error Handling Hardening (~10 min)

### Add Request Validation Middleware

```javascript
// src/utils/validateRequest.js

export function validateJsonBody(requiredFields) {
  return (req, res, next) => {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        error: 'Request body must be valid JSON',
        code: 'INVALID_JSON',
      });
    }

    const missing = requiredFields.filter(field => !req.body[field]);
    if (missing.length > 0) {
      return res.status(400).json({
        error: `Missing required fields: ${missing.join(', ')}`,
        code: 'MISSING_FIELDS',
        details: `Required: ${requiredFields.join(', ')}`,
      });
    }

    next();
  };
}
```

### Add Rate Limiting

```bash
npm install express-rate-limit
```

```javascript
// In src/index.js

import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 100,               // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests, please try again later',
    code: 'RATE_LIMITED',
  },
});

app.use('/api/', limiter);
```

### Add Request ID Tracking

```javascript
// In src/index.js middleware section

import { v4 as uuidv4 } from 'uuid';

app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-ID', req.requestId);
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} (${req.requestId})`);
  next();
});
```

### Ensure Consistent Error Format

Every error response MUST match this structure:

```json
{
  "error": "Human-readable error message",
  "code": "MACHINE_READABLE_CODE",
  "details": "Optional debugging info (dev mode only)"
}
```

> [!WARNING]
> **Never expose stack traces in production.** The global error handler should strip `err.stack` and `err.message` when `NODE_ENV !== 'development'`.

---

## Task 5.3: Add Health Check Enhancements (~5 min)

Update the health check to include more diagnostic information:

```javascript
// Update in src/index.js

app.get('/api/health', async (req, res) => {
  const health = {
    status: 'ok',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    activeConversations: getActiveConversationCount(),
    memoryUsage: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
    },
  };

  res.json(health);
});
```

> [!CAUTION]
> **Do not expose the actual API key** in the health check. Only report whether it's configured (`true/false`).

---

## Task 5.4: Performance Validation (~5 min)

### Add Response Time Logging

```javascript
// src/utils/timing.js

export function withTiming(label) {
  return (req, res, next) => {
    const start = Date.now();

    // Override res.json to capture timing
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const duration = Date.now() - start;
      console.log(`[Timing] ${label}: ${duration}ms`);
      res.setHeader('X-Response-Time', `${duration}ms`);
      return originalJson(body);
    };

    next();
  };
}
```

```javascript
// Apply to routes
import { withTiming } from './utils/timing.js';

app.use('/api/analyze', withTiming('POST /api/analyze'));
app.use('/api/contractor-reply', withTiming('POST /api/contractor-reply'));
app.use('/api/status', withTiming('GET /api/status'));
```

### Performance Targets

| Endpoint | Target | Acceptable | Too Slow |
|----------|--------|-----------|----------|
| `POST /api/analyze` | < 3s | < 5s | > 5s |
| `POST /api/contractor-reply` | < 2s | < 3s | > 3s |
| `GET /api/status/:id` | < 50ms | < 100ms | > 100ms |
| `GET /api/health` | < 10ms | < 50ms | > 50ms |

### Quick Performance Test

```bash
# Time the analyze endpoint
time curl -s -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"imageUrl": "https://example.com/hvac.jpg", "userId": "perf_test"}' > /dev/null
```

---

## Task 5.5: Cross-Track Integration (~10 min)

### Integration with Track 1 (Frontend)

Verify that the frontend can call your API:

```bash
# From the Track 1 frontend machine, test CORS:
curl -X OPTIONS http://localhost:3000/api/analyze \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  -v 2>&1 | grep -i "access-control"
```

**Expected headers:**
```
access-control-allow-origin: http://localhost:5173
access-control-allow-methods: GET,POST
```

### Integration with Track 3 (Integrations)

Verify the contractor search and webhook work:

```bash
# Test that Track 3 can call your webhook:
curl -X POST http://localhost:3000/api/contractor-reply \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:8080" \
  -d '{
    "conversationId": "TEST_ID",
    "contractorId": "test_001",
    "contractorName": "Test Contractor",
    "message": "I can do it for $350. Available tomorrow."
  }'
```

### Integration Checklist

| Integration Point | Track | Status |
|-------------------|-------|--------|
| Frontend calls `POST /api/analyze` | Track 1 → Track 2 | ⬜ |
| Frontend polls `GET /api/status/:id` | Track 1 → Track 2 | ⬜ |
| Agent calls `POST /api/search-contractors` | Track 2 → Track 3 | ⬜ |
| Track 3 calls `POST /api/contractor-reply` | Track 3 → Track 2 | ⬜ |
| Agent calls `POST /api/notify` | Track 2 → Track 1 | ⬜ |

> [!TIP]
> If Track 1 or Track 3 aren't ready yet, verify your endpoints work with curl and move on. The mock mode ensures you can demo independently.

---

## Task 5.6: Demo Rehearsal (~15 min)

### Demo Script

**Duration:** 3–5 minutes

1. **Open** the terminal with the server running
2. **Show** the health check: `curl http://localhost:3000/api/health`
3. **Narrate:** *"Our AI maintenance agent uses Gemini 3.5 Flash to analyze photos of broken appliances."*
4. **Submit** a photo:
   ```bash
   curl -X POST http://localhost:3000/api/analyze \
     -H "Content-Type: application/json" \
     -d '{"imageUrl": "https://example.com/broken-hvac.jpg", "userId": "demo_user"}'
   ```
5. **Show** the analysis result: *"Gemini identified this as a Carrier HVAC unit, model 24ACC636A003, with a suspected refrigerant leak."*
6. **Show** the state: *"The agent automatically contacted 3 contractors."*
7. **Simulate** contractor replies (run the 3 curl commands from `07_MOCKING_RESPONSES.md`)
8. **Show** the final status: *"The agent selected Mike's HVAC Solutions at $385 — the best combination of price, availability, and rating."*
9. **Highlight** the scoring: *"We use a weighted algorithm: 60% price, 25% availability, 15% contractor rating."*

### Demo Tips

> [!TIP]
> - **Pre-run the mock flow once** before the demo to warm up the server
> - **Have the demo.sh script ready** as a backup if live typing goes wrong
> - **Keep a tab with `GET /api/status/:id` open** to show real-time state changes
> - **Practice 2-3 times** — each run-through should take under 5 minutes

### Backup: Mock Mode Demo

If the real Gemini API is slow or rate-limited during the demo:

```bash
# Switch to mock mode instantly
NODE_ENV=development node src/index.js
```

Mock mode gives instant responses with realistic-looking data — perfect for demo reliability.

> [!CAUTION]
> **Do not push your `.env` file to git before the demo.** Double-check `.gitignore` includes `.env`.

---

## Final Deliverables Checklist — All 5 Hours

### Hour 1 ✅
- [ ] Node.js project with `package.json`
- [ ] All dependencies installed
- [ ] `.env` with `GEMINI_API_KEY`
- [ ] Vision System Prompt
- [ ] Gemini API connectivity verified
- [ ] Express server with health check

### Hour 2 ✅
- [ ] Image processing service (`imageService.js`)
- [ ] Vision service (`visionService.js`)
- [ ] `POST /api/analyze` endpoint
- [ ] Contractor search service (mock)
- [ ] Tested with real images

### Hour 3 ✅
- [ ] State manager (`stateManager.js`)
- [ ] Negotiation Parse Prompt
- [ ] Negotiation service (`negotiationService.js`)
- [ ] `POST /api/contractor-reply` webhook
- [ ] `GET /api/status/:conversationId` endpoint
- [ ] Tested contractor reply parsing

### Hour 4 ✅
- [ ] Best-quote selection algorithm
- [ ] User notification service
- [ ] All edge cases handled (decline, no price, timeout, duplicate, all-decline)
- [ ] Full flow integration test passes

### Hour 5 ✅
- [ ] End-to-end testing with real Gemini 3.5 Flash API
- [ ] Rate limiting added
- [ ] Request ID tracking
- [ ] Request validation middleware
- [ ] Response time logging
- [ ] Health check enhanced
- [ ] Cross-track integration verified (or mocked)
- [ ] Demo rehearsed 2–3 times
- [ ] Mock fallback ready for demo day
- [ ] `.env` NOT committed to git

> [!IMPORTANT]
> **Your agent should now handle the complete Critical User Journey:**
>
> 📸 User uploads photo → 🤖 Gemini 3.5 Flash identifies appliance → 🔍 Agent finds 3 contractors → 💬 Contractors reply with quotes → ⚖️ Agent scores and selects best quote → 🔔 User notified with recommendation
>
> If this flow works end-to-end, you're ready to demo. 🎉
