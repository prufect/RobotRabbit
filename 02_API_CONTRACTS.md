# API Contracts & Boundaries

To work in parallel, we must agree on API boundaries immediately.

## 1. POST /api/analyze
*   **Owner:** Track 2 (AI Agent)
*   **Input:** `{ "imageUrl": "https://insforge.../img.jpg", "conversationId": "123" }`
*   **Output (Success):** `{ "status": "identified", "category": "HVAC", "model": "Carrier 5000", "message": "I found it. Looking for plumbers..." }`
*   **Output (Needs Info):** `{ "status": "needs_info", "message": "I can't see the model number. Can you upload a photo of the sticker?" }`

## 2. POST /api/search-contractors
*   **Owner:** Track 3 (Integrations)
*   **Input:** `{ "category": "HVAC", "location": "San Francisco, CA" }`
*   **Output:** `{ "contractors": [ {"name": "Bob's Plumbing", "phone": "+1234567890"} ] }`

## 3. POST /api/notify-contractors
*   **Owner:** Track 3 (Integrations)
*   **Input:** `{ "contractors": [...], "imageUrl": "...", "urgency": "high" }`
*   **Output:** `{ "success": true, "notifiedCount": 3 }`
