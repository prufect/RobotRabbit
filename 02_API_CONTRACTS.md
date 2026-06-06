# Strict API Contracts

> [!WARNING]
> **Executive Summary:** Do not deviate from these API contracts. The success of parallel development relies on these exact JSON structures. If you need to change a field, announce it to the entire team immediately.

## 1. POST `/api/analyze`
**Owner:** Track 2 (AI Agent)
**Purpose:** Takes an image URL and processes it through the Vision AI.

### Request payload (JSON)
```json
{
  "conversationId": "uuid-1234",
  "userId": "user-5678",
  "imageUrl": "https://storage.insforge.com/bucket/img_123.jpg",
  "urgency": "high"
}
```

### Response Payload - Success (HTTP 200)
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

### Response Payload - Needs Info (HTTP 200)
```json
{
  "status": "success",
  "isIdentified": false,
  "category": "unknown",
  "brand": null,
  "modelNumber": null,
  "messageToUser": "I can see the electrical panel, but the sticker is too blurry. Can you take a close-up photo of the sticker on the inside door?"
}
```

---

## 2. POST `/api/search-contractors`
**Owner:** Track 3 (Integrations)
**Purpose:** Finds local contractors based on the identified issue.

### Request payload (JSON)
```json
{
  "searchQuery": "Carrier HVAC repair",
  "location": "San Francisco, CA",
  "limit": 3
}
```

### Response Payload (HTTP 200)
```json
{
  "status": "success",
  "results": [
    {
      "name": "Bob's Quick HVAC",
      "phone": "+14155550101",
      "rating": 4.8
    },
    {
      "name": "SF Carrier Experts",
      "phone": "+14155550202",
      "rating": 4.5
    }
  ]
}
```

---

## 3. POST `/api/notify-contractors`
**Owner:** Track 3 (Integrations)
**Purpose:** Sends the automated WhatsApp/Telegram outreach.

### Request payload (JSON)
```json
{
  "contractors": [
    {
      "name": "Bob's Quick HVAC",
      "phone": "+14155550101"
    }
  ],
  "issueDetails": {
    "category": "hvac",
    "brand": "Carrier",
    "model": "Infinity 26",
    "imageUrl": "https://storage.insforge.com/bucket/img_123.jpg",
    "urgency": "high"
  }
}
```

### Response Payload (HTTP 200)
```json
{
  "status": "success",
  "notifiedCount": 1,
  "errors": []
}
```
