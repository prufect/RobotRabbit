# Hour 4: Quote Selection & Edge Cases (3:00–4:00)

> [!IMPORTANT]
> **Executive Summary:** This hour focuses on making the agent robust — implementing the weighted best-quote selection algorithm, wiring up user notifications, and handling every edge case: contractor declines, missing prices, negotiation timeouts, duplicate replies, and total failure scenarios. By the end of Hour 4, the agent should handle any combination of contractor responses gracefully.

---

## Time Budget

| Task | Time | Priority |
|------|------|----------|
| 4.1 Implement Best-Quote Selection | 15 min | 🔴 Critical |
| 4.2 Wire Up User Notification | 10 min | 🟡 High |
| 4.3 Handle Edge Cases | 20 min | 🔴 Critical |
| 4.4 Integration Test the Full Flow | 15 min | 🔴 Critical |
| **Total** | **60 min** | |

---

## Task 4.1: Implement Best-Quote Selection (~15 min)

The scoring algorithm was defined in `05_DECISION_TREE_LOGIC.md`. Now we integrate it into the contractor-reply flow. The `selectBestQuote` function should already exist in `stateManager.js` from Hour 3 — verify it works correctly.

### Scoring Formula Recap

```
totalScore = (priceScore × 0.60) + (availabilityScore × 0.25) + (ratingScore × 0.15)
```

### Test the Scoring Algorithm

```javascript
// src/utils/testScoring.js

import { createConversation, updateState, addQuote, selectBestQuote } from '../services/stateManager.js';

function testScoring() {
  console.log('🧪 Testing quote scoring algorithm...\n');

  const conv = createConversation({ category: 'hvac' });
  updateState(conv.id, 'SEARCHING_CONTRACTORS');
  updateState(conv.id, 'NEGOTIATING');

  // Add quotes
  addQuote(conv.id, {
    contractorName: "Mike's HVAC Solutions",
    priceQuote: 385,
    currency: 'USD',
    availability: 'Thursday or Friday this week',
    isDeclined: false,
    counterOffer: null,
    notes: 'Common Carrier unit fix',
  });

  addQuote(conv.id, {
    contractorName: 'CoolAir Pros',
    priceQuote: 450,
    currency: 'USD',
    availability: 'Next Monday',
    isDeclined: false,
    counterOffer: null,
    notes: '90-day warranty',
  });

  addQuote(conv.id, {
    contractorName: 'Budget HVAC',
    priceQuote: 320,
    currency: 'USD',
    availability: 'Two weeks from now',
    isDeclined: false,
    counterOffer: null,
    notes: '',
  });

  const ratings = {
    "Mike's HVAC Solutions": 4.8,
    'CoolAir Pros': 4.5,
    'Budget HVAC': 3.9,
  };

  const best = selectBestQuote(conv.id, ratings);

  console.log('\n📊 Quote Scores:');
  const view = conv;
  view.quotes.forEach(q => {
    console.log(`   ${q.contractorName}: $${q.priceQuote} | Avail: ${q.availability} | Score: ${q.score}`);
  });

  console.log(`\n🏆 Winner: ${best.contractorName} ($${best.priceQuote}, score: ${best.score})`);
}

testScoring();
```

```bash
node src/utils/testScoring.js
```

**Expected output:**
```
🏆 Winner: Budget HVAC ($320, score: ...) or Mike's HVAC Solutions ($385, score: ...)
```

> [!NOTE]
> The winner depends on the interplay between price and availability. Budget HVAC has the lowest price but worst availability (2 weeks = 0.3). Mike has a slightly higher price but much better availability (this week = 0.7). Run the test to see which wins.

---

## Task 4.2: Wire Up User Notification (~10 min)

Create a notification service that alerts the user when the best quote is selected:

```javascript
// src/services/notificationService.js

import fetch from 'node-fetch';

const TRACK_1_BASE_URL = process.env.TRACK_1_URL || 'http://localhost:5173';

/**
 * Notifies the user that the best quote has been selected.
 * In hackathon mode, this POSTs to Track 1's notification endpoint.
 * Falls back to console logging if Track 1 is unavailable.
 */
export async function notifyUser(conversationId, bestQuote, analysis) {
  const notification = {
    conversationId,
    type: 'BEST_QUOTE_SELECTED',
    message: `Great news! We found the best deal for your ${analysis?.category || 'appliance'} repair.`,
    bestQuote: {
      contractorName: bestQuote.contractorName,
      priceQuote: bestQuote.priceQuote,
      currency: bestQuote.currency,
      availability: bestQuote.availability,
      score: bestQuote.score,
    },
    timestamp: new Date().toISOString(),
  };

  console.log(`\n🔔 USER NOTIFICATION`);
  console.log(`   Conversation: ${conversationId}`);
  console.log(`   Best Quote: ${bestQuote.contractorName} — $${bestQuote.priceQuote}`);
  console.log(`   Availability: ${bestQuote.availability}`);
  console.log(`   Score: ${bestQuote.score}\n`);

  // Try to notify Track 1 frontend
  try {
    const response = await fetch(`${TRACK_1_BASE_URL}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(notification),
    });

    if (response.ok) {
      console.log('[Notification] Track 1 notified successfully');
    } else {
      console.warn(`[Notification] Track 1 returned HTTP ${response.status}`);
    }
  } catch (err) {
    // Track 1 may not be running — that's OK during development
    console.warn(`[Notification] Could not reach Track 1: ${err.message}`);
    console.log('[Notification] Notification logged to console (Track 1 offline)');
  }

  return notification;
}

/**
 * Notifies the user that the agent failed to find quotes.
 */
export async function notifyUserFailure(conversationId, reason) {
  console.log(`\n⚠️  USER FAILURE NOTIFICATION`);
  console.log(`   Conversation: ${conversationId}`);
  console.log(`   Reason: ${reason}\n`);

  // Similar Track 1 notification attempt...
}
```

### Integrate into Contractor Reply Flow

Update `src/routes/contractorReply.js` to call `notifyUser` when the threshold is met:

```javascript
// Add to the thresholdMet block in contractorReply.js:

import { notifyUser } from '../services/notificationService.js';

// Inside the route handler, after selectBestQuote:
if (thresholdMet) {
  const bestQuote = selectBestQuote(conversationId, ratings);
  updateState(conversationId, 'COMPLETED');

  // Notify user (fire-and-forget)
  notifyUser(conversationId, bestQuote, conversation.analysis).catch(err => {
    console.error('[ContractorReply] Notification failed:', err.message);
  });

  responseData.bestQuote = bestQuote;
  responseData.conversationState = 'COMPLETED';
}
```

---

## Task 4.3: Handle Edge Cases (~20 min)

### Edge Case 1: Contractor Declines

A contractor replies with something like: *"Sorry, we're fully booked. We'd have to pass."*

```javascript
// In stateManager.js addQuote() — already handled:
if (!quote.isDeclined && quote.priceQuote !== null) {
  conv.quotes.push({ ...quote, receivedAt: new Date().toISOString() });
} else {
  console.log(`[StateManager] ${quote.contractorName} declined or gave no price`);
}
```

**Behavior:** Declined quotes are logged but not added to the quotes array. They don't count toward the threshold.

### Edge Case 2: No Price Given

A contractor replies: *"I'd need to come see it in person first before giving a price."*

The negotiation prompt sets `priceQuote: null` for this case. The `addQuote` function skips quotes with `null` price.

### Edge Case 3: Negotiation Timeout

If 5 minutes pass without enough quotes:

```javascript
// Already implemented in stateManager.js startNegotiationTimeout():
if (c.quotes.length > 0) {
  selectBestQuote(id);
  updateState(id, 'COMPLETED', { reason: 'Timeout — selected best available' });
} else {
  updateState(id, 'FAILED', { reason: 'Timeout — no valid quotes received' });
}
```

**Behavior:** If any valid quotes exist, the best one is selected. If zero quotes, conversation fails.

### Edge Case 4: Duplicate Contractor Replies

```javascript
// Already implemented in addQuote():
if (conv.quotes.some(q => q.contractorName === quote.contractorName)) {
  return { added: false, thresholdMet: false, duplicate: true };
}
```

**API response for duplicates:**
```json
{ "error": "Duplicate reply from Mike's HVAC Solutions", "code": "DUPLICATE_REPLY" }
```

### Edge Case 5: All Contractors Decline

Track the total number of responses (including declines). If all contacted contractors have responded and all declined:

```javascript
// Add to contractorReply.js after addQuote():

// Check if all contractors have responded
const totalResponses = conversation.quotes.length + getDeclinedCount(conversationId);
const totalContacted = conversation.contractors?.length || 3;

if (totalResponses >= totalContacted && conversation.quotes.length === 0) {
  updateState(conversationId, 'FAILED', {
    reason: 'All contractors declined the repair request',
  });
  notifyUserFailure(conversationId, 'All contractors declined').catch(console.error);
}
```

> [!WARNING]
> **Timeout race condition:** If a contractor reply arrives at the exact moment the timeout fires, you could get a double state transition. The `updateState` function's transition validation prevents this — it will throw on `COMPLETED → COMPLETED` or `FAILED → COMPLETED`.

### Edge Case Summary

| Scenario | Result | Quote Counted? |
|----------|--------|----------------|
| Contractor gives quote | Added to quotes | ✅ Yes |
| Contractor declines | Logged, not added | ❌ No |
| No price mentioned | Treated like decline | ❌ No |
| Duplicate reply | Rejected, 409 returned | ❌ No |
| Timeout with quotes | Best selected, COMPLETED | — |
| Timeout without quotes | FAILED | — |
| All decline | FAILED | — |

---

## Task 4.4: Integration Test the Full Flow (~15 min)

Run the complete flow end-to-end using curl commands:

```bash
#!/bin/bash
# test_full_flow.sh

echo "🧪 Full Flow Integration Test"
echo "=============================="

# Step 1: Analyze
echo -e "\n📸 Step 1: Analyzing image..."
RESPONSE=$(curl -s -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"imageUrl": "https://example.com/broken-hvac.jpg", "userId": "test_user"}')

CONV_ID=$(echo $RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin)['conversationId'])")
echo "  Conversation: $CONV_ID"
echo "  State: $(echo $RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin)['state'])")"

# Step 2: Check status — should be NEGOTIATING
echo -e "\n📊 Step 2: Checking status..."
curl -s http://localhost:3000/api/status/$CONV_ID | python3 -c "import sys, json; d=json.load(sys.stdin); print(f'  State: {d[\"state\"]}, Quotes: {len(d[\"quotes\"])}')"

# Step 3: Mike replies with a quote
echo -e "\n📞 Step 3: Mike's HVAC replies..."
curl -s -X POST http://localhost:3000/api/contractor-reply \
  -H "Content-Type: application/json" \
  -d "{\"conversationId\": \"$CONV_ID\", \"contractorId\": \"mike_001\", \"contractorName\": \"Mike's HVAC Solutions\", \"message\": \"I can do it for \$385. Available Thursday.\"}" \
  | python3 -c "import sys, json; d=json.load(sys.stdin); print(f'  Parsed: \${d[\"quoteParsed\"][\"priceQuote\"]}, Quotes: {d[\"totalQuotes\"]}')"

# Step 4: CoolAir replies with a quote
echo -e "\n📞 Step 4: CoolAir Pros replies..."
curl -s -X POST http://localhost:3000/api/contractor-reply \
  -H "Content-Type: application/json" \
  -d "{\"conversationId\": \"$CONV_ID\", \"contractorId\": \"coolair_002\", \"contractorName\": \"CoolAir Pros\", \"message\": \"Our rate is \$450. Next Monday.\"}" \
  | python3 -c "import sys, json; d=json.load(sys.stdin); print(f'  Parsed: \${d[\"quoteParsed\"][\"priceQuote\"]}, Quotes: {d[\"totalQuotes\"]}')"

# Step 5: Valley declines
echo -e "\n📞 Step 5: Valley Climate declines..."
curl -s -X POST http://localhost:3000/api/contractor-reply \
  -H "Content-Type: application/json" \
  -d "{\"conversationId\": \"$CONV_ID\", \"contractorId\": \"valley_003\", \"contractorName\": \"Valley Climate Control\", \"message\": \"Sorry, we're fully booked. We'd have to pass.\"}" \
  | python3 -c "import sys, json; d=json.load(sys.stdin); print(f'  Declined: {d[\"quoteParsed\"][\"isDeclined\"]}, Quotes: {d[\"totalQuotes\"]}')"

# Step 6: Third valid quote (to trigger completion)
echo -e "\n📞 Step 6: Express Repair replies..."
curl -s -X POST http://localhost:3000/api/contractor-reply \
  -H "Content-Type: application/json" \
  -d "{\"conversationId\": \"$CONV_ID\", \"contractorId\": \"express_004\", \"contractorName\": \"Express Repair Co\", \"message\": \"We can fix that for \$410. Available tomorrow morning.\"}" \
  | python3 -c "import sys, json; d=json.load(sys.stdin); print(f'  Threshold met: {d.get(\"thresholdMet\", False)}'); best=d.get('bestQuote'); print(f'  Best: {best[\"contractorName\"]} \${best[\"priceQuote\"]}' if best else '  No best yet')"

# Step 7: Final status
echo -e "\n📊 Step 7: Final status..."
curl -s http://localhost:3000/api/status/$CONV_ID | python3 -m json.tool

echo -e "\n✅ Integration test complete!"
```

> [!CAUTION]
> **In-memory state is lost on server restart.** If you restart the server between steps, all conversation data is gone. Run the full flow in one session.

---

## Hour 4 Deliverables Checklist

- [ ] Best-quote selection algorithm verified with test script
- [ ] `src/services/notificationService.js` — user notification service
- [ ] Notification fires when quote threshold is met
- [ ] Edge case: contractor decline → logged, not counted as quote
- [ ] Edge case: no price given → treated as non-quote
- [ ] Edge case: duplicate reply → rejected with 409
- [ ] Edge case: negotiation timeout → best available selected or FAILED
- [ ] Edge case: all contractors decline → FAILED state
- [ ] Full flow integration test passes (analyze → 3 replies → best quote)
- [ ] Console output shows clear state transitions and notifications
- [ ] All error responses return consistent JSON format
