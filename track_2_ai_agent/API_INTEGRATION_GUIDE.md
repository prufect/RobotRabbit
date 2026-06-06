# Track 2 (AI Agent) — API Integration Guide

> **Share this file with all other tracks.** It defines exactly how to communicate with the Track 2 AI Agent backend.

---

## Quick Start

```bash
# Track 2 server runs on port 3002
# Base URL: http://localhost:3002
```

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/analyze` | POST | Send a photo for AI analysis |
| `/api/contractor-reply` | POST | Forward a contractor's reply message |
| `/api/status/:conversationId` | GET | Check negotiation progress |
| `/api/health` | GET | Health check |

---

## Endpoint 1: `POST /api/analyze`

**Who calls this?** → **Track 1 (Frontend)** after the user uploads a photo.

### Request

```bash
curl -X POST http://localhost:3002/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "uuid-1234",
    "userId": "user-5678",
    "imageUrl": "https://storage.insforge.com/bucket/img_123.jpg",
    "urgency": "high"
  }'
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `conversationId` | string | ✅ | Unique ID for this conversation (generate a UUID on the frontend) |
| `userId` | string | ✅ | The logged-in user's ID |
| `imageUrl` | string | ✅ | Public URL of the uploaded image (from Track 4's storage) |
| `urgency` | string | ❌ | `"high"`, `"medium"`, or `"low"` (defaults to `"normal"`) |

### Response — Appliance Identified (happy path)

```json
{
  "status": "success",
  "isIdentified": true,
  "category": "hvac",
  "brand": "Carrier",
  "modelNumber": "Infinity 26",
  "messageToUser": "I have identified a Carrier Infinity 26 HVAC unit. Searching for available contractors now...",
  "contractorSearchQuery": "Carrier HVAC repair"
}
```

**What happens behind the scenes:** Track 2 automatically calls Track 3's `/api/search-contractors` and `/api/notify-contractors` to find and message 3 local professionals. No action needed from the frontend.

### Response — Needs More Info

```json
{
  "status": "success",
  "isIdentified": false,
  "category": "unknown",
  "brand": null,
  "modelNumber": null,
  "messageToUser": "I can see an electrical panel, but the label is not visible. Can you take a close-up of the rating plate?",
  "contractorSearchQuery": null
}
```

**Frontend action:** Display `messageToUser` in the chat UI and prompt the user to upload another photo. Then call `/api/analyze` again with the same `conversationId` and the new `imageUrl`.

### Error Response (400 / 500)

```json
{
  "status": "error",
  "code": "VALIDATION_ERROR",
  "message": "Invalid request body.",
  "details": {
    "errors": ["imageUrl is required and must be a string."]
  }
}
```

---

## Endpoint 2: `POST /api/contractor-reply`

**Who calls this?** → **Track 3 (Integrations)** when a contractor replies via WhatsApp/Telegram/SMS.

### Request

```bash
curl -X POST http://localhost:3002/api/contractor-reply \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "uuid-1234",
    "contractorPhone": "+14155550101",
    "contractorName": "Bob'\''s Quick HVAC",
    "messageBody": "Yes, available in 1 hour. $150 call-out fee."
  }'
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `conversationId` | string | ✅ | Must match the original conversation |
| `contractorPhone` | string | ✅ | Contractor's phone number |
| `contractorName` | string | ✅ | Contractor's business name |
| `messageBody` | string | ✅ | The raw text of the contractor's reply |

### Response — Quote Recorded (still waiting for more)

```json
{
  "status": "success",
  "action": "quote_recorded",
  "quotesReceived": 1,
  "quotesNeeded": 3,
  "readyForUser": false
}
```

### Response — Negotiation Complete (3+ quotes received)

```json
{
  "status": "success",
  "action": "negotiation_complete",
  "quotesReceived": 3,
  "quotesNeeded": 3,
  "readyForUser": true,
  "bestQuote": {
    "contractorName": "SF Carrier Experts",
    "phone": "+14155550202",
    "price": 120,
    "availability": "2 hours",
    "summary": "Best price at $120, available in 2 hours."
  },
  "allQuotes": [
    { "contractorName": "Bob's Quick HVAC", "phone": "+14155550101", "price": 150, "availability": "1 hour", "available": true },
    { "contractorName": "SF Carrier Experts", "phone": "+14155550202", "price": 120, "availability": "2 hours", "available": true },
    { "contractorName": "Bay Area Fix-It", "phone": "+14155550303", "price": 180, "availability": "tomorrow morning", "available": true }
  ],
  "messageToUser": "Great news! I've compared 3 quotes for your repair. Best price at $120, available in 2 hours."
}
```

> [!IMPORTANT]
> **Track 1 (Frontend):** When `readyForUser` is `true`, display the `messageToUser` and `bestQuote` to the user with a "Book Now" button.

---

## Endpoint 3: `GET /api/status/:conversationId`

**Who calls this?** → **Track 1 (Frontend)** to poll for negotiation progress.

### Request

```bash
curl http://localhost:3002/api/status/uuid-1234
```

### Response

```json
{
  "status": "success",
  "session": {
    "conversationId": "uuid-1234",
    "userId": "user-5678",
    "urgency": "high",
    "status": "NEGOTIATING",
    "issueDetails": {
      "category": "hvac",
      "brand": "Carrier",
      "modelNumber": "Infinity 26",
      "imageUrl": "https://storage.insforge.com/bucket/img_123.jpg"
    },
    "contractors": [
      { "name": "Bob's Quick HVAC", "phone": "+14155550101", "rating": 4.8 },
      { "name": "SF Carrier Experts", "phone": "+14155550202", "rating": 4.5 },
      { "name": "Bay Area Fix-It", "phone": "+14155550303", "rating": 4.7 }
    ],
    "quotesReceived": 1,
    "quotes": [
      { "contractorName": "Bob's Quick HVAC", "phone": "+14155550101", "price": 150, "availability": "1 hour", "available": true }
    ],
    "bestQuote": null,
    "createdAt": "2026-06-06T17:30:00.000Z",
    "updatedAt": "2026-06-06T17:32:00.000Z"
  }
}
```

### Session Status Values

| Status | Meaning | Frontend Action |
|--------|---------|-----------------|
| `IMAGE_ANALYSIS` | Waiting for user to upload a better photo | Show `messageToUser`, prompt for new photo |
| `SEARCHING_CONTRACTORS` | Finding local contractors | Show loading spinner |
| `NEGOTIATING` | Waiting for contractor replies (0–2 quotes so far) | Show "Comparing quotes..." with progress |
| `COMPLETED` | 3+ quotes received, best quote selected | Show best quote + "Book Now" button |
| `FAILED` | Something went wrong | Show error message |

> [!TIP]
> **Polling strategy:** Call `GET /api/status/:conversationId` every 5 seconds while status is `NEGOTIATING`. Stop polling when status is `COMPLETED` or `FAILED`.

---

## Endpoint 4: `GET /api/health`

```bash
curl http://localhost:3002/api/health
```

```json
{
  "status": "ok",
  "service": "track-2-ai-agent",
  "version": "1.0.0",
  "timestamp": "2026-06-06T17:30:00.000Z",
  "environment": "development",
  "geminiModel": "gemini-2.5-flash"
}
```

---

## What Track 2 NEEDS From Other Tracks

### From Track 1 (Frontend)
| What | Why | Details |
|------|-----|---------|
| `imageUrl` | We analyze the image | Must be a publicly accessible HTTPS URL (JPEG, PNG, or WebP, max 20 MB) |
| `conversationId` | Session tracking | Generate a UUID v4 on the frontend for each new conversation |
| `userId` | User tracking | The currently logged-in user's ID |
| Polling on `/api/status` | Show progress to user | Poll every 5s while `NEGOTIATING`, stop on `COMPLETED`/`FAILED` |

### From Track 3 (Integrations)
| What | Why | Details |
|------|-----|---------|
| `POST /api/search-contractors` running on port 3001 | We call it to find contractors | Must accept `{ searchQuery, location, limit }` and return `{ results: [...] }` |
| `POST /api/notify-contractors` running on port 3001 | We call it to send messages | Must accept `{ contractors, issueDetails }` |
| Contractor replies forwarded to our `POST /api/contractor-reply` | We parse the quotes | When a contractor replies via WhatsApp/Telegram, Track 3's webhook must forward it to us |

### From Track 4 (Data/Ops)
| What | Why | Details |
|------|-----|---------|
| Image uploaded to public storage | We need a URL to fetch the image | The `imageUrl` passed to `/api/analyze` must be publicly fetchable |

> [!WARNING]
> **If Track 3 is not running**, Track 2 automatically falls back to mock contractor data. This means you can develop and test Track 1 ↔ Track 2 without Track 3 being ready.

---

## What Track 2 PROVIDES To Other Tracks

### To Track 1 (Frontend)
- Image analysis results (brand, model, category)
- Chat messages to display (`messageToUser` field in every response)
- Real-time negotiation status via polling
- Final best quote with contractor details

### To Track 3 (Integrations)
- We automatically call your search/notify endpoints — no extra wiring needed from your side
- We provide the webhook endpoint (`POST /api/contractor-reply`) for you to forward contractor messages

---

## Full CUJ Flow (End-to-End Sequence)

```
1. User uploads photo
   └─→ Track 1 uploads to storage (Track 4) → gets imageUrl

2. Track 1 calls POST /api/analyze { conversationId, userId, imageUrl, urgency }
   └─→ Track 2 analyzes via Gemini Vision

3a. If identified:
   └─→ Track 2 calls Track 3 POST /api/search-contractors
   └─→ Track 2 calls Track 3 POST /api/notify-contractors
   └─→ Contractors receive WhatsApp messages

3b. If NOT identified:
   └─→ Track 2 returns messageToUser asking for better photo
   └─→ Track 1 shows message, user uploads new photo → go to step 2

4. Contractors reply via WhatsApp/Telegram
   └─→ Track 3 webhook receives the reply
   └─→ Track 3 forwards to Track 2 POST /api/contractor-reply

5. Track 2 parses each reply with Gemini NLP
   └─→ Extracts: available?, price, availability
   └─→ Records quote in session

6. After 3 quotes received:
   └─→ Track 2 selects best quote (lowest price, fastest availability)
   └─→ Session status → COMPLETED

7. Track 1 polls GET /api/status/:conversationId
   └─→ Sees readyForUser: true
   └─→ Displays best quote to user with "Book Now" button
```

---

## Running Track 2 Locally

```bash
cd /Users/priyanksingh/Desktop/Hooman/maintenance_agent_hackathon/track_2_ai_agent

# Install dependencies (already done)
npm install

# Start the server
npm run dev

# Run tests
npm test
```

**Server starts on `http://localhost:3002`**

The Gemini API key is already configured in `.env`. Do not commit the `.env` file to git.
