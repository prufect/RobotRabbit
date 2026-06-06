# High-Level Architecture

## Components
1. **Frontend (Vercel + Next.js)**: Mobile web app with camera and chat UI.
2. **Backend & DB (InsForge)**: Postgres DB for state, Object Storage for photos.
3. **AI Brain (InsForge Edge Functions)**: Invokes Vision Models (GPT-4o/Claude) to parse images.
4. **Integrations (Node.js)**: Web search (SerpApi) and Messaging (Twilio for WhatsApp, Telegram API).
5. **Automation (Replicas)**: Background agents used to generate boilerplate code.

## Flow
1. User uploads photo -> Saved to InsForge Storage.
2. Frontend calls `POST /api/analyze` (InsForge Edge).
3. Vision Model parses image -> Returns model details OR asks for a sticker.
4. If identified, Edge function triggers `POST /api/search-contractors`.
5. Search API finds 3 contractors -> Triggers `POST /api/notify-contractors`.
6. Twilio/Telegram sends messages to contractors.
