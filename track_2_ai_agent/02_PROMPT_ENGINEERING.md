# The Vision System Prompt & Negotiation Parse Prompt

> [!IMPORTANT]
> **Executive Summary:** This file defines the two core prompts powering the maintenance agent: (1) the **Vision System Prompt** that analyzes photos of broken appliances using Gemini 3.5 Flash, and (2) the **Negotiation Parse Prompt** that extracts structured quote data from natural-language contractor replies. Both prompts enforce raw JSON output — never Markdown-wrapped JSON.

---

## Section 1: Vision System Prompt

### Purpose
When a user uploads a photo of a broken appliance, Gemini 3.5 Flash uses this prompt to:
- Identify the appliance category (HVAC, electrical, plumbing)
- Extract brand and model number from visible labels
- Assess urgency level
- Generate a contractor search query

### The Prompt

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

Example response for an identified HVAC unit:
{
  "status": "success",
  "isIdentified": true,
  "category": "hvac",
  "brand": "Carrier",
  "modelNumber": "24ACC636A003",
  "messageToUser": "I identified your Carrier HVAC unit (model 24ACC636A003). It appears to have a refrigerant leak based on the ice buildup on the evaporator coils. I'll search for qualified HVAC technicians in your area.",
  "contractorSearchQuery": "HVAC repair Carrier 24ACC636A003 refrigerant leak",
  "urgencyLevel": "high",
  "issueDescription": "Carrier HVAC unit with suspected refrigerant leak - ice buildup visible on evaporator coils"
}
`;
```

### Code Example: Calling Gemini 3.5 Flash with the Vision Prompt

```javascript
// src/services/visionService.js

import { GoogleGenerativeAI } from '@google/generative-ai';
import { VISION_SYSTEM_PROMPT } from '../prompts/visionPrompt.js';
import { fetchAndPrepareImage } from './imageService.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

export async function analyzeImage(imageUrl) {
  const { base64Data, mimeType } = await fetchAndPrepareImage(imageUrl);

  const result = await model.generateContent([
    { text: VISION_SYSTEM_PROMPT },
    { text: 'Analyze this maintenance issue.' },
    {
      inlineData: {
        mimeType,
        data: base64Data,
      },
    },
  ]);

  const responseText = result.response.text();

  // Strip any accidental markdown fencing
  const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('Failed to parse Gemini response:', responseText);
    throw new Error('Gemini returned non-JSON response');
  }
}
```

> [!TIP]
> **Keep prompts under 500 tokens** for faster response times. The Vision System Prompt above is ~280 tokens — well within the sweet spot for Gemini 3.5 Flash latency.

### Prompt Engineering Best Practices

| Practice | Why It Matters |
|---|---|
| **"RAW JSON only"** | Prevents Gemini from wrapping output in ```json fences |
| **Include an example response** | Dramatically improves output consistency |
| **Enumerate all enum values** | `"hvac" \| "electrical" \| "plumbing"` prevents hallucinated categories |
| **Explicit null handling** | `string \| null` tells the model it's OK to omit unknown fields |
| **Role framing** | "expert home maintenance technician" activates domain knowledge |

---

## Section 2: Negotiation Parse Prompt

### Purpose
When a contractor responds to a repair inquiry (via SMS, email, or chat), the agent receives their natural-language reply. This prompt instructs Gemini 3.5 Flash to extract structured data from that reply.

### Example Contractor Replies
These are realistic messages the agent will need to parse:

| Contractor | Raw Message |
|---|---|
| Mike's HVAC | *"Hey, I looked at the model you sent. That's a Carrier unit, pretty common fix. I can do it for $385 and I'm available this Thursday or Friday."* |
| CoolAir Pros | *"We can handle that repair. Our rate for that model would be $450. Earliest availability is next Monday."* |
| Valley Climate | *"Thanks for reaching out. Unfortunately, we're fully booked for the next two weeks. We'd have to pass on this one."* |

### The Prompt

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

Example input: "Hey, I can fix that for $385. I'm free Thursday or Friday."
Example output:
{
  "contractorName": "Mike's HVAC",
  "priceQuote": 385,
  "currency": "USD",
  "availability": "Thursday or Friday this week",
  "isDeclined": false,
  "counterOffer": null,
  "notes": ""
}
`;
```

### Code Example: Parsing a Contractor Reply

```javascript
// src/services/negotiationService.js

import { GoogleGenerativeAI } from '@google/generative-ai';
import { NEGOTIATION_PARSE_PROMPT } from '../prompts/negotiationPrompt.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

export async function parseContractorReply(message, contractorName) {
  const prompt = `${NEGOTIATION_PARSE_PROMPT}

Contractor name: ${contractorName}
Contractor's reply: "${message}"

Extract the structured data:`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();

  const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    // Ensure contractorName is set even if Gemini omits it
    parsed.contractorName = parsed.contractorName || contractorName;
    return parsed;
  } catch (err) {
    console.error('Failed to parse negotiation response:', responseText);
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
```

> [!NOTE]
> The fallback return object ensures the agent never crashes on unparseable replies. The raw message is preserved in `notes` for manual review.

### Expected Parse Results

| Contractor | priceQuote | availability | isDeclined | notes |
|---|---|---|---|---|
| Mike's HVAC | 385 | Thursday or Friday this week | false | Common Carrier unit fix |
| CoolAir Pros | 450 | Next Monday | false | — |
| Valley Climate | null | null | true | Fully booked for 2 weeks |

---

## Checklists

- [ ] Vision System Prompt exported from `src/prompts/visionPrompt.js`
- [ ] Negotiation Parse Prompt exported from `src/prompts/negotiationPrompt.js`
- [ ] Both prompts enforce raw JSON output (no markdown fencing)
- [ ] Both prompts include example responses for consistency
- [ ] All enum values explicitly listed in both prompts
- [ ] Fallback handling for unparseable responses implemented
- [ ] Tested both prompts with Gemini 3.5 Flash and verified JSON output
