# InsForge Backend Design

## Context

AgentRabbit is a hackathon prototype for an AI maintenance agent. A homeowner signs in, uploads a photo of a broken home-maintenance item, gets AI identification or a request for more information, then the system searches for nearby contractors and messages them for availability and pricing.

The existing repository is a planning scaffold with root product, architecture, and API contract documents plus separate frontend, AI agent, integrations, and data/ops tracks. There is no application code yet. The current architecture already names InsForge as the backend platform for Postgres, Storage, and Edge Functions.

InsForge's current agent guidance says to use `npx @insforge/cli`, link a project, manage schema with `migrations/`, store binary photos in Storage, run short request/response backend logic in Deno Edge Functions, and call model providers through OpenRouter from trusted server-side code.

## Goals

- Use real user accounts with Google login through InsForge Auth.
- Store each user's repair requests, uploaded photo metadata, chat timeline, contractor results, and notification outcomes in InsForge Postgres.
- Store repair photos in a private InsForge Storage bucket.
- Implement the AI analysis, contractor search, contractor notification, and background job processing as InsForge Edge Functions.
- Preserve the existing conceptual API boundaries: analyze, search contractors, and notify contractors.
- Support an end-to-end hackathon demo even when paid external API keys are missing by falling back to realistic mock search and notification behavior.
- Make agent progress inspectable and retryable through database-backed jobs instead of hidden in process memory.

## Non-Goals

- Build the frontend UI in this backend setup phase.
- Implement payments, subscriptions, analytics, or long-running custom compute.
- Build a production-grade contractor reply ingestion system. Incoming WhatsApp or Telegram replies can be added after the core demo flow works.
- Add vector search or retrieval-augmented generation.

## Recommended Approach

Use an InsForge-native backend:

- InsForge Auth handles Google OAuth and user sessions.
- InsForge Postgres stores app data with row-level security.
- InsForge Storage stores repair photos in a private `repair-photos` bucket.
- InsForge Edge Functions handle `analyze`, `search-contractors`, `notify-contractors`, and `process-agent-jobs`.
- The Next.js frontend uses the InsForge TypeScript SDK for auth, upload, database reads, and function invocation. If the frontend team wants exact `/api/*` paths, Next.js can add thin wrappers that forward to InsForge functions.

This is preferred over a hybrid Vercel API backend because it keeps auth, storage, database, and backend function behavior inside the sponsor-native InsForge surface and gives the team one backend state model to inspect during the hackathon.

## Authentication

InsForge Auth is the source of identity. Google OAuth must be enabled on the InsForge project using the dashboard or the supported InsForge auth configuration surfaces. The frontend signs the user in with Google and receives an InsForge session token.

The backend keeps a `profiles` table keyed by the InsForge auth user id. For this linked InsForge project, app-owned user references use `uuid`, reference `auth.users(id)`, and RLS policies use `auth.uid()`. The profile row stores display information useful to the app, such as email, name, and avatar URL, but authorization decisions use the authenticated user id from the InsForge token.

Edge Functions that mutate user data must:

- Read the `Authorization: Bearer <token>` header.
- Create the InsForge SDK client with that user token.
- Fetch the current user.
- Reject unauthenticated requests with HTTP 401.
- Verify request ownership before reading or mutating user-owned data.

## Data Model

### `profiles`

One row per authenticated user.

- `id uuid primary key references auth.users(id) on delete cascade`: InsForge auth user id.
- `email text not null`.
- `full_name text`.
- `avatar_url text`.
- `created_at timestamptz not null default now()`.
- `updated_at timestamptz not null default now()`.

### `repair_requests`

One row per maintenance issue.

- `id uuid primary key default gen_random_uuid()`.
- `user_id uuid not null references auth.users(id) on delete cascade`: owner id from InsForge Auth.
- `status text not null`: `uploaded`, `needs_info`, `identified`, `searching`, `notifying`, `completed`, or `failed`.
- `category text`: examples include `HVAC`, `electrical`, `plumbing`, `appliance`, or `unknown`.
- `urgency text not null default 'normal'`: `low`, `normal`, `high`, or `emergency`.
- `location_text text`: user-entered location such as `San Francisco, CA`.
- `image_url text not null`: URL returned by InsForge Storage upload.
- `image_key text not null`: object key returned by InsForge Storage upload.
- `model_name text`: equipment or part model identified by AI.
- `diagnosis text`: short AI-generated description of likely issue.
- `next_question text`: question to show the user when status is `needs_info`.
- `created_at timestamptz not null default now()`.
- `updated_at timestamptz not null default now()`.

### `request_messages`

Chat-style timeline for a request.

- `id uuid primary key default gen_random_uuid()`.
- `request_id uuid not null references repair_requests(id) on delete cascade`.
- `user_id uuid not null references auth.users(id) on delete cascade`.
- `role text not null`: `user`, `assistant`, or `system`.
- `message_type text not null`: `text`, `image`, `analysis`, `search`, `notification`, or `error`.
- `content text not null`.
- `metadata jsonb not null default '{}'::jsonb`.
- `created_at timestamptz not null default now()`.

### `agent_jobs`

Durable work queue for the agent.

- `id uuid primary key default gen_random_uuid()`.
- `request_id uuid not null references repair_requests(id) on delete cascade`.
- `user_id uuid not null references auth.users(id) on delete cascade`.
- `job_type text not null`: `analyze_image`, `search_contractors`, or `notify_contractors`.
- `status text not null default 'pending'`: `pending`, `running`, `succeeded`, or `failed`.
- `payload jsonb not null default '{}'::jsonb`.
- `attempt_count integer not null default 0`.
- `last_error text`.
- `run_after timestamptz not null default now()`.
- `locked_at timestamptz`.
- `created_at timestamptz not null default now()`.
- `updated_at timestamptz not null default now()`.

### `contractors`

Normalized contractor search results.

- `id uuid primary key default gen_random_uuid()`.
- `name text not null`.
- `phone text`.
- `website text`.
- `category text not null`.
- `location_text text`.
- `source text not null`: `serpapi`, `mock`, `manual`, or another integration name.
- `source_ref text`: source-specific id or URL.
- `created_at timestamptz not null default now()`.

### `contractor_notifications`

Notification attempts for a request.

- `id uuid primary key default gen_random_uuid()`.
- `request_id uuid not null references repair_requests(id) on delete cascade`.
- `user_id uuid not null references auth.users(id) on delete cascade`.
- `contractor_id uuid references contractors(id)`.
- `channel text not null`: `whatsapp`, `telegram`, or `mock`.
- `destination text`: phone number, chat id, or mock destination.
- `status text not null`: `pending`, `sent`, `failed`, or `mock_sent`.
- `message text not null`.
- `provider_message_id text`.
- `last_error text`.
- `created_at timestamptz not null default now()`.
- `updated_at timestamptz not null default now()`.

## Storage

Create a private InsForge Storage bucket named `repair-photos`. The frontend uploads the photo with the InsForge SDK and stores both returned values:

- `image_url` for display and model input.
- `image_key` for download, delete, and future signed URL operations.

The app should not proxy photo bytes through Edge Functions during normal upload. Browser direct upload keeps the demo fast and avoids function timeout risk.

## Row-Level Security

Enable RLS on user-owned tables:

- `profiles`: users can read and update their own row.
- `repair_requests`: users can create, read, and update rows where `user_id` equals their authenticated user id.
- `request_messages`: users can read messages for their own requests and create messages tied to their own requests.
- `agent_jobs`: normal clients can read their own jobs for debugging/progress, but job creation and status mutation should happen through Edge Functions or narrowly scoped policies.
- `contractor_notifications`: users can read notification attempts tied to their own requests. Mutation should happen through Edge Functions.

`contractors` can be readable by authenticated users. Inserts can be restricted to Edge Functions or allowed only through controlled paths so repeated searches do not create unbounded duplicate records.

Internal function-to-function calls use an `AGENT_INTERNAL_SECRET` sent in an `X-Agent-Internal-Secret` header. This secret is stored only in InsForge function secrets. Public clients never receive it. A function that receives this header still records the affected `user_id` and `request_id` on every row it mutates.

## Edge Functions

### `analyze`

Input:

```json
{
  "requestId": "uuid"
}
```

Behavior:

1. Authenticate the caller.
2. Load the `repair_requests` row and verify ownership.
3. Append a system or assistant message indicating analysis started.
4. Call a vision-capable model through OpenRouter from server-side code.
5. If the image is insufficient, update the request to `needs_info`, set `next_question`, and append an assistant message.
6. If the item is identified, update the request to `identified`, set `category`, `model_name`, and `diagnosis`, append an assistant message, and create a `search_contractors` job.
7. For a responsive demo, call `process-agent-jobs` after creating the search job or let the frontend invoke the processor once after analysis succeeds.

Output follows the existing contract shape:

```json
{
  "status": "identified",
  "category": "HVAC",
  "model": "Carrier 5000",
  "message": "I found it. Looking for HVAC contractors..."
}
```

or:

```json
{
  "status": "needs_info",
  "message": "I can't see the model number. Can you upload a photo of the sticker?"
}
```

### `search-contractors`

Input:

```json
{
  "requestId": "uuid"
}
```

Behavior:

1. Authenticate the caller or verify `X-Agent-Internal-Secret` for an internal job-processing invocation.
2. Load the request and verify ownership or internal job authority.
3. Use `category` and `location_text` to search for three contractors.
4. If `SERPAPI_KEY` exists, call SerpApi.
5. If `SERPAPI_KEY` is missing, return three realistic mock contractors using the requested category and location.
6. Upsert contractor records.
7. Create `notify_contractors` jobs or return contractors to the processor.
8. Append a search result message to the request timeline.

### `notify-contractors`

Input:

```json
{
  "requestId": "uuid",
  "contractorIds": ["uuid"]
}
```

Behavior:

1. Authenticate the caller or verify `X-Agent-Internal-Secret` for an internal job-processing invocation.
2. Load the request and contractors.
3. Build a concise message with category, diagnosis, urgency, location, and photo URL.
4. If Twilio WhatsApp credentials exist, send WhatsApp messages.
5. If Telegram credentials exist and contractor Telegram destinations exist, send Telegram messages.
6. If messaging credentials are missing, create `mock_sent` notification records.
7. Append a notification summary message to the request timeline.

### `process-agent-jobs`

Input:

```json
{
  "limit": 3
}
```

Behavior:

1. Authenticate the caller as either the request owner for demo-triggered processing or verify `X-Agent-Internal-Secret` for an internal scheduled/service invocation.
2. Find pending jobs whose `run_after` is in the past.
3. Claim jobs by setting `status = 'running'`, incrementing `attempt_count`, and setting `locked_at`.
4. Dispatch by `job_type`.
5. Mark jobs `succeeded` after successful work.
6. Mark jobs `failed` with `last_error` after max attempts or non-retryable errors.
7. For retryable failures, set `status = 'pending'` and move `run_after` forward with a short backoff.

For the hackathon demo, the frontend can invoke this function after `analyze` returns `identified`, and `analyze` can also opportunistically invoke it. Later, this function can be scheduled or triggered by database inserts.

## Agent Pickup Flow

The agent picks up work from `agent_jobs`, not from process memory.

1. User signs in with Google.
2. User uploads a photo to `repair-photos`.
3. Frontend creates a `repair_requests` row with `status = 'uploaded'`.
4. Frontend calls `analyze`.
5. `analyze` identifies the request or asks for more info.
6. If identified, `analyze` creates a `search_contractors` job.
7. `process-agent-jobs` claims the search job.
8. Search results are saved to `contractors`.
9. Notification jobs are created and processed.
10. `contractor_notifications` records show sent, failed, or mock-sent outcomes.
11. `request_messages` gives the user a readable progress timeline.

## Environment And Secrets

Commit only non-secret examples. Real values live in InsForge function secrets, deployment environment variables, or the local developer shell.

Expected variables:

- `INSFORGE_BASE_URL`: project API base URL.
- `INSFORGE_ANON_KEY`: public anon key for frontend and public SDK operations.
- `OPENROUTER_API_KEY`: server-side key copied from InsForge Model Gateway/OpenRouter configuration.
- `AGENT_INTERNAL_SECRET`: server-side shared secret for internal Edge Function job dispatch.
- `SERPAPI_KEY`: optional real search key.
- `TWILIO_ACCOUNT_SID`: optional WhatsApp messaging credential.
- `TWILIO_AUTH_TOKEN`: optional WhatsApp messaging credential.
- `TWILIO_WHATSAPP_FROM`: optional WhatsApp sender.
- `TELEGRAM_BOT_TOKEN`: optional Telegram messaging credential.

## Error Handling

Every agent step is recoverable and visible:

- Invalid auth returns 401.
- Missing or foreign request ids return 404 to avoid leaking existence.
- Bad input returns 400 with a concise message.
- Vision failure updates the request to `failed` or keeps it actionable with an assistant message asking the user to try another photo.
- Search and notification failures are captured on `agent_jobs.last_error` and user-visible timeline messages.
- Mock search and mock notifications keep the demo path functional when external service credentials are missing.

## Testing And Verification

Backend verification should cover:

- Google login creates a valid InsForge authenticated session.
- An authenticated user can create and read their own `repair_requests` row.
- A second authenticated user cannot read or mutate the first user's request.
- Photo upload stores both `image_url` and `image_key`.
- `analyze` rejects unauthenticated calls.
- `analyze` rejects calls for requests owned by another user.
- `analyze` can return `needs_info` and append an assistant message.
- `analyze` can return `identified`, update the request, and create a `search_contractors` job.
- `process-agent-jobs` claims pending jobs and records attempts.
- Search returns three contractors with SerpApi when configured and mocks when not configured.
- Notification records are created as `sent`, `failed`, or `mock_sent`.
- The full demo path ends with a readable `request_messages` timeline.

## Implementation Order

1. Verify the repo is linked to the InsForge project with `npx @insforge/cli current`. The current linked project is `RobotRabbit` with API base `https://pzv974n7.us-east.insforge.app`.
2. Add `.env.example` with public and server-side variable names but no secrets.
3. Add database migrations for extensions, tables, constraints, indexes, and RLS policies.
4. Create the private `repair-photos` storage bucket.
5. Configure Google OAuth for InsForge Auth.
6. Add Edge Function source for `analyze` with mocked model output first.
7. Add Edge Function source for `search-contractors` with mock fallback.
8. Add Edge Function source for `notify-contractors` with mock fallback.
9. Add Edge Function source for `process-agent-jobs`.
10. Replace mocked model output in `analyze` with OpenRouter vision calls.
11. Run CLI diagnostics and a manual end-to-end backend smoke test.

## References

- InsForge agent workflow: https://insforge.dev/skill.md
- InsForge documentation index: https://docs.insforge.dev/llms.txt
- InsForge CLI setup: https://docs.insforge.dev/quickstart.md
- InsForge CLI harness: https://docs.insforge.dev/agent-native/cli-harness.md
- InsForge database migrations: https://docs.insforge.dev/core-concepts/database/migrations.md
- InsForge database overview: https://docs.insforge.dev/core-concepts/database/overview.md
- InsForge storage overview: https://docs.insforge.dev/core-concepts/storage/overview.md
- InsForge storage SDK: https://docs.insforge.dev/sdks/typescript/storage.md
- InsForge Edge Functions: https://docs.insforge.dev/core-concepts/functions/overview.md
- InsForge Functions SDK: https://docs.insforge.dev/sdks/typescript/functions.md
- InsForge Model Gateway: https://docs.insforge.dev/core-concepts/ai/overview.md
- InsForge TypeScript AI guidance: https://docs.insforge.dev/sdks/typescript/ai.md
