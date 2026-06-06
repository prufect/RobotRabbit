# Track 3 — Integrations Service

Connects the AI brain (Track 2) to the real world: **find local contractors**
and **message them on WhatsApp/Telegram**. Implements the two endpoints Track 3
owns in `02_API_CONTRACTS.md`, plus a Twilio reply webhook for CUJ 3.

> **Works with zero credentials.** Every external call has a mock fallback, so
> `npm start` gives a fully working demo. Add keys to `.env` to go live.

## Quick start

```bash
cd track_3_integrations
npm install
cp .env.example .env      # optional — leave keys blank for mock mode
npm start                 # boots on :3003
# or, no server needed:
npm run test:smoke        # runs search -> notify end to end in mock mode
```

## Endpoints

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `POST` | `/api/search-contractors` | Find contractors (SerpApi → mock fallback) |
| `POST` | `/api/notify-contractors` | Outreach via WhatsApp → Telegram → mock |
| `POST` | `/webhooks/twilio` | Receive contractor replies (CUJ 3) |
| `GET`  | `/api/responses` | Poll captured replies (for Track 1 UI) |
| `GET`  | `/health` | Status + which integrations are live vs mock |

### Examples

```bash
curl -s localhost:3003/api/search-contractors \
  -H 'content-type: application/json' \
  -d '{"searchQuery":"Carrier HVAC repair","location":"San Francisco, CA","limit":3}'

curl -s localhost:3003/api/notify-contractors \
  -H 'content-type: application/json' \
  -d '{
    "contractors":[{"name":"Bob'\''s Quick HVAC","phone":"+14155550101"}],
    "issueDetails":{"category":"hvac","brand":"Carrier","model":"Infinity 26",
      "imageUrl":"https://example.com/ac.jpg","urgency":"high"}
  }'
```

Responses match `02_API_CONTRACTS.md` exactly (`search-contractors` adds a
`source: "serpapi"|"mock"` field so you can see which path ran).

## Going live on stage

1. **SerpApi:** put `SERPAPI_KEY` in `.env` for real Google Local results.
2. **Twilio WhatsApp:** set `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`. Have
   each stage "contractor" text `join <sandbox-keyword>` to the sandbox number,
   and use their real numbers in the contractor list.
3. **Reply webhook:** expose the server (e.g. `ngrok http 3003`) and set the
   sandbox "When a message comes in" URL to `<public-url>/webhooks/twilio`.
4. **Telegram (fallback):** set `TELEGRAM_BOT_TOKEN` (+ `TELEGRAM_DEFAULT_CHAT_ID`).

Set `MOCK_MODE=true` to force all-mock for a safe rehearsal even with keys present.

## Architecture

```
Track 2 (AI) --identifies--> POST /api/search-contractors --SerpApi--> results
                             POST /api/notify-contractors --Twilio/Telegram--> contractors
contractor reply --> POST /webhooks/twilio --> GET /api/responses --> Track 1 UI
```

| File | Role |
| ---- | ---- |
| `src/server.js` | Express app + routes + webhook |
| `src/search.js` | SerpApi search with mock fallback |
| `src/notify.js`  | WhatsApp → Telegram → mock send chain |
| `src/templates.js` | Contractor message wording |
| `src/mockData.js` | Category-aware fake contractors |
| `src/config.js` | Env + live/mock detection |
