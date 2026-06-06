#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Track 2 — Full CUJ Demo Script
#
# This script tests the ENTIRE flow end-to-end:
#   1. Starts Mock Track 3 (simulates contractor search/notify/replies)
#   2. Starts Track 2 (the AI Agent)
#   3. Sends a photo for analysis (CUJ 1: Happy Path)
#   4. Contractor replies are simulated automatically
#   5. Negotiation completes, best quote is selected
#
# Usage:
#   chmod +x tests/run-demo.sh
#   ./tests/run-demo.sh
# ═══════════════════════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  🏠 Track 2 — AI Maintenance Agent — Full CUJ Demo"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ── Cleanup function ──────────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo "🧹 Shutting down servers..."
  kill $TRACK3_PID 2>/dev/null || true
  kill $TRACK2_PID 2>/dev/null || true
  echo "✅ Done."
}
trap cleanup EXIT

# ── Start Mock Track 3 ───────────────────────────────────────────────────────
echo "🔌 Starting Mock Track 3 (port 3001)..."
node tests/mock-track3-server.js &
TRACK3_PID=$!
sleep 2

# ── Start Track 2 ────────────────────────────────────────────────────────────
echo "🤖 Starting Track 2 AI Agent (port 3002)..."
node src/index.js &
TRACK2_PID=$!
sleep 2

# ── Health Checks ─────────────────────────────────────────────────────────────
echo ""
echo "🏥 Health checks..."
echo -n "   Track 2: "
curl -s http://localhost:3002/api/health | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'✅ {d[\"service\"]} v{d[\"version\"]} ({d[\"geminiModel\"]})')"
echo -n "   Track 3: "
curl -s http://localhost:3001/api/health | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'✅ {d[\"service\"]} v{d[\"version\"]}')"

# ── CUJ 1: Happy Path ────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  📸 CUJ 1: User uploads a photo of an AC unit"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Sending image to POST /api/analyze..."
echo "(Using a real public image — Gemini will analyze it)"
echo ""

CONV_ID="demo-$(date +%s)"

ANALYZE_RESULT=$(curl -s -X POST http://localhost:3002/api/analyze \
  -H "Content-Type: application/json" \
  -d "{
    \"conversationId\": \"${CONV_ID}\",
    \"userId\": \"demo-user\",
    \"imageUrl\": \"https://images.unsplash.com/photo-1585338107529-13afc5f02586?w=800\",
    \"urgency\": \"high\"
  }")

echo "📋 Analysis Result:"
echo "$ANALYZE_RESULT" | python3 -m json.tool

IS_IDENTIFIED=$(echo "$ANALYZE_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('isIdentified', False))")
MSG_TO_USER=$(echo "$ANALYZE_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('messageToUser', 'N/A'))")

echo ""
echo "💬 Agent says to user: \"$MSG_TO_USER\""

if [ "$IS_IDENTIFIED" = "True" ]; then
  echo ""
  echo "✅ Appliance identified! Contractors are being contacted..."
  echo ""
  echo "⏳ Waiting for contractor replies (3 replies over ~10 seconds)..."
  echo "   (Mock Track 3 is simulating WhatsApp replies)"
  echo ""

  # Wait for all 3 simulated replies to complete
  sleep 12

  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "  📊 Final Session Status"
  echo "═══════════════════════════════════════════════════════════════"
  echo ""

  curl -s "http://localhost:3002/api/status/${CONV_ID}" | python3 -m json.tool
else
  echo ""
  echo "ℹ️  Appliance not fully identified (Gemini couldn't see a label)."
  echo "   In the real app, the user would upload a closer photo."
  echo ""
  echo "   Let's still test the negotiation flow manually..."
  echo ""

  # Simulate sending 3 contractor replies directly
  echo "📱 Simulating 3 contractor replies..."
  echo ""

  echo "   → Bob's Quick HVAC: \"Available in 1 hour. \$150 call-out fee.\""
  curl -s -X POST http://localhost:3002/api/contractor-reply \
    -H "Content-Type: application/json" \
    -d "{
      \"conversationId\": \"${CONV_ID}\",
      \"contractorPhone\": \"+14155550101\",
      \"contractorName\": \"Bob's Quick HVAC\",
      \"messageBody\": \"Yes, available in 1 hour. \$150 call-out fee.\"
    }" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'     ✓ {d[\"action\"]} ({d[\"quotesReceived\"]}/{d[\"quotesNeeded\"]})')"

  sleep 1

  echo "   → SF Carrier Experts: \"2 hours, \$120 call-out.\""
  curl -s -X POST http://localhost:3002/api/contractor-reply \
    -H "Content-Type: application/json" \
    -d "{
      \"conversationId\": \"${CONV_ID}\",
      \"contractorPhone\": \"+14155550202\",
      \"contractorName\": \"SF Carrier Experts\",
      \"messageBody\": \"We can come in about 2 hours. Rate is \$120 for the call-out.\"
    }" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'     ✓ {d[\"action\"]} ({d[\"quotesReceived\"]}/{d[\"quotesNeeded\"]})')"

  sleep 1

  echo "   → Bay Area Fix-It: \"Tomorrow morning, \$180 flat rate.\""
  FINAL_RESULT=$(curl -s -X POST http://localhost:3002/api/contractor-reply \
    -H "Content-Type: application/json" \
    -d "{
      \"conversationId\": \"${CONV_ID}\",
      \"contractorPhone\": \"+14155550303\",
      \"contractorName\": \"Bay Area Fix-It\",
      \"messageBody\": \"Hi! I can squeeze you in tomorrow morning around 9 AM. \$180 flat rate.\"
    }")

  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "  🎉 Negotiation Complete!"
  echo "═══════════════════════════════════════════════════════════════"
  echo ""
  echo "$FINAL_RESULT" | python3 -m json.tool

  BEST_NAME=$(echo "$FINAL_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('bestQuote',{}).get('contractorName','N/A'))" 2>/dev/null)
  BEST_PRICE=$(echo "$FINAL_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('bestQuote',{}).get('price','N/A'))" 2>/dev/null)
  BEST_AVAIL=$(echo "$FINAL_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('bestQuote',{}).get('availability','N/A'))" 2>/dev/null)
  USER_MSG=$(echo "$FINAL_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('messageToUser','N/A'))" 2>/dev/null)

  echo ""
  echo "🏆 Best Quote: $BEST_NAME — \$$BEST_PRICE, available in $BEST_AVAIL"
  echo "💬 Message to user: \"$USER_MSG\""
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ Demo Complete — Track 2 is fully operational!"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Keep running for a moment so logs flush
sleep 2
