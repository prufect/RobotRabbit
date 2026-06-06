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
| `POST` | `/webhooks/twilio` | Receive + parse contractor replies (CUJ 3) |
| `GET`  | `/api/responses` | Poll captured replies (for Track 1 UI) |
| `GET`  | `/api/best-quote` | Ranked quotes (cheapest first, soonest ETA breaks ties) |
| `POST` | `/api/book` | Book a winner: message them + auto-decline the rest |
| `GET`  | `/api/conversations` | Message Center: all threads, grouped by contractor |
| `GET`  | `/api/conversations/:phone` | Full message thread for one contractor |
| `GET`  | `/messages.html` | **Live Message Center UI** (open in a browser) |
| `GET`  | `/health` | Status + which integrations are live vs mock |

### Message Center (Track 3 capture + Track 4 storage)

Every message between the agent and a service provider — **both directions, any
channel** — is recorded by [src/store.js](src/store.js): outbound sends (via
`deliver`), inbound replies (via the webhook), bookings, and declines. Each row
is tagged with the `requestId` you pass to `/api/notify-contractors`.

- **See it live:** start the server and open `http://localhost:3003/messages.html`
  — a WhatsApp-style chat UI that polls every 2s. Fire a notify / simulate a
  reply and watch the thread appear.
- **Storage:** the in-memory log always powers the UI. Set `DATABASE_URL` (Track 4
  InsForge Postgres) and messages also persist to the `messages` table — see
  [track_4_data_ops/sql/002_messages.sql](../track_4_data_ops/sql/002_messages.sql).

### Quote engine + booking (CUJ 3)

Contractor replies are parsed for **availability**, **price**, and **ETA**
(`parseReply` in [src/quotes.js](src/quotes.js) — handles negations like
"sorry, not available" and Spanish). Then:

```bash
curl -s localhost:3003/api/best-quote          # -> { best, ranked[] }
curl -s localhost:3003/api/book -H 'content-type: application/json' \
  -d '{"phone":"+14155550202"}'                # winner gets "you got the job",
                                               # other bidders get a polite decline
```

### Message templates

[src/templates.js](src/templates.js) builds outreach, reminder, winner, and
decline messages — **channel-aware** (`whatsapp`/`telegram` use `*bold*`, `sms`
goes plain), **category-aware** (HVAC/electrical/plumbing framing), and
**bilingual** (`locale: 'en' | 'es'`). Pass `locale` in the notify/book bodies
to switch language.

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
| `src/notify.js`  | WhatsApp → Telegram → mock send chain (reusable `deliver`) |
| `src/quotes.js`  | Parse + rank contractor replies (quote engine) |
| `src/store.js`   | Message Center store (in-memory + optional Postgres) |
| `src/templates.js` | Channel/locale/category-aware message wording |
| `public/messages.html` | Live Message Center chat UI |
| `src/mockData.js` | Category-aware fake contractors |
| `src/config.js` | Env + live/mock detection |
