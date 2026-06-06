# API Endpoint Documentation

> [!IMPORTANT]
> **Executive Summary:** Four REST endpoints power the maintenance agent: `POST /api/analyze` (submit appliance photo), `POST /api/contractor-reply` (receive contractor webhook), `GET /api/status/:conversationId` (check progress), and `GET /api/health` (health check). All endpoints return JSON with consistent error formatting and are CORS-enabled for cross-origin access from the Track 1 frontend.

---

## Base URL

```
http://localhost:3000
```

## Common Headers

| Header | Value | Required |
|--------|-------|----------|
| `Content-Type` | `application/json` | Yes (POST requests) |
| `Accept` | `application/json` | Recommended |

---

## 1. `POST /api/analyze`

Accepts an image URL, analyzes it with Gemini 3.5 Flash, creates a conversation, and triggers a contractor search.

### Request

```http
POST /api/analyze HTTP/1.1
Content-Type: application/json

{
  "imageUrl": "https://example.com/photos/broken-hvac.jpg",
  "userId": "user_abc123"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `imageUrl` | `string` | ✅ | URL of the appliance photo (JPEG, PNG, or WebP) |
| `userId` | `string` | ✅ | Unique identifier for the user submitting the request |

### Success Response — `201 Created`

```json
{
  "conversationId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "state": "SEARCHING_CONTRACTORS",
  "analysis": {
    "status": "success",
    "isIdentified": true,
    "category": "hvac",
    "brand": "Carrier",
    "modelNumber": "24ACC636A003",
    "messageToUser": "I identified your Carrier HVAC unit (model 24ACC636A003). It appears to have a refrigerant leak. I'll search for qualified HVAC technicians in your area.",
    "contractorSearchQuery": "HVAC repair Carrier 24ACC636A003 refrigerant leak",
    "urgencyLevel": "high",
    "issueDescription": "Carrier HVAC unit with suspected refrigerant leak"
  },
  "contractorsContacted": 3,
  "createdAt": "2026-06-06T10:30:00.000Z"
}
```

### Error Responses

| Status | Code | When |
|--------|------|------|
| `400` | `MISSING_IMAGE_URL` | `imageUrl` not provided |
| `400` | `MISSING_USER_ID` | `userId` not provided |
| `422` | `IMAGE_PROCESSING_FAILED` | Image could not be fetched, is corrupt, or unsupported format |
| `422` | `ANALYSIS_FAILED` | Gemini 3.5 Flash could not analyze the image |
| `500` | `INTERNAL_ERROR` | Unexpected server error |

### curl Example

```bash
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "imageUrl": "https://example.com/photos/broken-hvac.jpg",
    "userId": "user_abc123"
  }'
```

---

## 2. `POST /api/contractor-reply`

Webhook endpoint for contractor responses. Track 3 (Integrations) calls this endpoint when a contractor texts or emails back with a quote.

### Request

```http
POST /api/contractor-reply HTTP/1.1
Content-Type: application/json

{
  "conversationId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "contractorId": "contractor_mike_001",
  "contractorName": "Mike's HVAC Solutions",
  "message": "Hey, I looked at the model you sent. That's a Carrier unit, pretty common fix. I can do it for $385 and I'm available this Thursday or Friday."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `conversationId` | `string` | ✅ | The conversation this reply belongs to |
| `contractorId` | `string` | ✅ | Unique contractor identifier from Track 3 |
| `contractorName` | `string` | ✅ | Human-readable contractor name |
| `message` | `string` | ✅ | Raw text of the contractor's reply |

### Success Response — `200 OK`

```json
{
  "received": true,
  "quoteParsed": {
    "contractorName": "Mike's HVAC Solutions",
    "priceQuote": 385,
    "currency": "USD",
    "availability": "Thursday or Friday this week",
    "isDeclined": false,
    "counterOffer": null,
    "notes": "Common Carrier unit fix"
  },
  "totalQuotes": 1,
  "thresholdMet": false
}
```

### When 3+ Quotes Are Received — `200 OK`

```json
{
  "received": true,
  "quoteParsed": {
    "contractorName": "CoolAir Pros",
    "priceQuote": 450,
    "currency": "USD",
    "availability": "Next Monday",
    "isDeclined": false,
    "counterOffer": null,
    "notes": ""
  },
  "totalQuotes": 3,
  "thresholdMet": true,
  "bestQuote": {
    "contractorName": "Mike's HVAC Solutions",
    "priceQuote": 385,
    "currency": "USD",
    "availability": "Thursday or Friday this week",
    "isDeclined": false,
    "score": 0.607
  },
  "conversationState": "COMPLETED"
}
```

### Error Responses

| Status | Code | When |
|--------|------|------|
| `400` | `MISSING_FIELDS` | Required fields not provided |
| `404` | `CONVERSATION_NOT_FOUND` | `conversationId` doesn't exist |
| `409` | `INVALID_STATE` | Conversation is not in `NEGOTIATING` state |
| `409` | `DUPLICATE_REPLY` | This contractor already replied |
| `500` | `PARSE_ERROR` | Gemini 3.5 Flash failed to parse the reply |

### curl Example

```bash
curl -X POST http://localhost:3000/api/contractor-reply \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "contractorId": "contractor_mike_001",
    "contractorName": "Mike'\''s HVAC Solutions",
    "message": "Hey, I can do it for $385. Available Thursday or Friday."
  }'
```

---

## 3. `GET /api/status/:conversationId`

Returns the current state, analysis, quotes, and best quote for a conversation.

### Request

```http
GET /api/status/f47ac10b-58cc-4372-a567-0e02b2c3d479 HTTP/1.1
```

### Success Response — `200 OK`

```json
{
  "conversationId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "state": "NEGOTIATING",
  "analysis": {
    "status": "success",
    "isIdentified": true,
    "category": "hvac",
    "brand": "Carrier",
    "modelNumber": "24ACC636A003",
    "urgencyLevel": "high",
    "issueDescription": "Carrier HVAC unit with suspected refrigerant leak"
  },
  "quotes": [
    {
      "contractorName": "Mike's HVAC Solutions",
      "priceQuote": 385,
      "currency": "USD",
      "availability": "Thursday or Friday this week",
      "isDeclined": false,
      "receivedAt": "2026-06-06T10:32:15.000Z"
    }
  ],
  "bestQuote": null,
  "failureReason": null,
  "createdAt": "2026-06-06T10:30:00.000Z",
  "updatedAt": "2026-06-06T10:32:15.000Z"
}
```

### Error Responses

| Status | Code | When |
|--------|------|------|
| `404` | `CONVERSATION_NOT_FOUND` | `conversationId` doesn't exist |

### curl Example

```bash
curl http://localhost:3000/api/status/f47ac10b-58cc-4372-a567-0e02b2c3d479
```

---

## 4. `GET /api/health`

Health check endpoint for monitoring and integration verification.

### Request

```http
GET /api/health HTTP/1.1
```

### Success Response — `200 OK`

```json
{
  "status": "ok",
  "uptime": 3621,
  "version": "1.0.0",
  "timestamp": "2026-06-06T10:30:00.000Z",
  "geminiConfigured": true,
  "activeConversations": 2
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | `string` | Always `"ok"` when server is running |
| `uptime` | `number` | Server uptime in seconds |
| `version` | `string` | From `package.json` |
| `timestamp` | `string` | Current server time (ISO 8601) |
| `geminiConfigured` | `boolean` | `true` if `GEMINI_API_KEY` is set |
| `activeConversations` | `number` | Count of in-memory conversations |

### curl Example

```bash
curl http://localhost:3000/api/health
```

---

## Error Response Format

All errors follow a consistent JSON structure:

```json
{
  "error": "Human-readable error message",
  "code": "MACHINE_READABLE_CODE",
  "details": "Optional additional context for debugging"
}
```

> [!TIP]
> The `code` field is designed for programmatic error handling in the frontend. Always check `code` rather than parsing `error` strings.

---

## CORS Configuration

```javascript
// src/index.js

import cors from 'cors';

const corsOptions = {
  origin: [
    'http://localhost:5173',   // Vite dev server (Track 1 frontend)
    'http://localhost:3001',   // Alternative frontend port
    'http://localhost:8080',   // Track 3 integrations
  ],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400, // 24 hours preflight cache
};

app.use(cors(corsOptions));
```

> [!WARNING]
> For the hackathon, you can use `cors()` with no options (allows all origins). But **never** do this in production.

---

## Express Router Setup

```javascript
// src/index.js

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { analyzeRouter } from './routes/analyze.js';
import { contractorReplyRouter } from './routes/contractorReply.js';
import { statusRouter } from './routes/status.js';
import { getActiveConversationCount } from './services/stateManager.js';

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

// Routes
app.use('/api', analyzeRouter);
app.use('/api', contractorReplyRouter);
app.use('/api', statusRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    activeConversations: getActiveConversationCount(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.path}`,
    code: 'NOT_FOUND',
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

app.listen(PORT, () => {
  console.log(`🏠 Maintenance Agent API running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
});
```

---

## Checklists

- [ ] `POST /api/analyze` endpoint implemented and tested
- [ ] `POST /api/contractor-reply` webhook endpoint implemented and tested
- [ ] `GET /api/status/:conversationId` endpoint implemented and tested
- [ ] `GET /api/health` endpoint implemented and tested
- [ ] Consistent error response format across all endpoints
- [ ] Request body validation on all POST endpoints
- [ ] CORS configured for Track 1 frontend origin
- [ ] Request logging middleware active
- [ ] 404 handler for unknown routes
- [ ] Global error handler prevents stack trace leaks
- [ ] All endpoints tested with curl
