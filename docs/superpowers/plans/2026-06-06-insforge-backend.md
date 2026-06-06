# InsForge Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the InsForge backend for AgentRabbit with Google-authenticated users, private repair photo storage, durable agent jobs, AI analysis, contractor search, and contractor notification records.

**Architecture:** InsForge Auth owns Google login and emits user session tokens. InsForge Postgres stores user-owned repair data behind RLS, InsForge Storage stores private photos, and Deno Edge Functions run the request/response backend. The implementation is mock-first so the demo works without paid integration keys, then real OpenRouter, SerpApi, Twilio, and Telegram paths activate when secrets exist.

**Tech Stack:** InsForge CLI, InsForge Postgres migrations, InsForge Storage, InsForge Deno Edge Functions, TypeScript, `@insforge/sdk`, OpenRouter via `openai`, SerpApi, Twilio WhatsApp REST API, Telegram Bot API, Vitest.

---

## Source Spec

Use the approved design in `docs/superpowers/specs/2026-06-06-insforge-backend-design.md`. The linked InsForge project guidance in `AGENTS.md` says to reference users with `auth.users(id)`, use `auth.uid()` in RLS policies, and pass arrays to SDK `insert` calls.

## File Structure

- Create `.env.example`: documents public and server-side environment variables without secret values.
- Create `.gitignore`: keeps local secrets, dependencies, and generated bundles out of git.
- Create `package.json`: local TypeScript test harness for backend modules.
- Create `tsconfig.json`: strict TypeScript settings for tests and shared function modules.
- Create `vitest.config.ts`: Vitest config for Node-based unit tests.
- Create `scripts/bundle-functions.mjs`: bundles each Edge Function entrypoint so local shared modules are included in deploy artifacts.
- Create `migrations/20260606190000_create_agentrabbit_backend.sql`: database schema, indexes, triggers, RLS helper, and policies.
- Create `functions/_shared/types.ts`: shared TypeScript types for requests, jobs, contractors, and notifications.
- Create `functions/_shared/http.ts`: CORS, JSON, body parsing, bearer-token helpers.
- Create `functions/_shared/analysis.ts`: analysis prompt, mock analysis, and model-output normalization.
- Create `functions/_shared/search.ts`: contractor query building, mock results, and SerpApi parsing.
- Create `functions/_shared/notifications.ts`: outbound contractor message building and mock/Twilio/Telegram helpers.
- Create `functions/_shared/jobs.ts`: retry and job transition helpers.
- Create `functions/analyze.ts`: authenticated image-analysis Edge Function.
- Create `functions/search-contractors.ts`: authenticated contractor-search Edge Function with mock fallback.
- Create `functions/notify-contractors.ts`: authenticated contractor-notification Edge Function with mock fallback.
- Create `functions/process-agent-jobs.ts`: authenticated job processor for user-owned pending jobs.
- Create `tests/backend/env-example.test.ts`: verifies `.env.example`.
- Create `tests/backend/migration.test.ts`: verifies migration contains schema/RLS essentials.
- Create `tests/backend/analysis.test.ts`: verifies analysis normalization and mock flow.
- Create `tests/backend/search.test.ts`: verifies mock contractors and SerpApi parsing.
- Create `tests/backend/notifications.test.ts`: verifies contractor message format.
- Create `tests/backend/jobs.test.ts`: verifies retry/backoff decisions.

## Task 1: Local Backend Test Harness And Env Contract

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `tests/backend/env-example.test.ts`
- Create: `.env.example`

- [ ] **Step 1: Create the TypeScript test harness**

Create `package.json`:

```json
{
  "name": "agentrabbit",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "build:functions": "node scripts/bundle-functions.mjs"
  },
  "dependencies": {
    "@insforge/sdk": "^1.3.1",
    "openai": "^6.42.0"
  },
  "devDependencies": {
    "@types/node": "^25.9.2",
    "esbuild": "^0.28.0",
    "typescript": "^6.0.3",
    "vitest": "^4.1.8"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["functions/_shared/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
}
```

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

Create `.gitignore`:

```gitignore
.env
.env.local
node_modules/
dist/
```

- [ ] **Step 2: Install dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` is created and `npm` exits successfully.

- [ ] **Step 3: Write the failing env contract test**

Create `tests/backend/env-example.test.ts`:

```typescript
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const requiredKeys = [
  'INSFORGE_BASE_URL',
  'INSFORGE_ANON_KEY',
  'OPENROUTER_API_KEY',
  'AGENT_INTERNAL_SECRET',
  'SERPAPI_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_WHATSAPP_FROM',
  'TELEGRAM_BOT_TOKEN',
];

describe('.env.example', () => {
  it('documents every backend variable without real secrets', () => {
    const file = readFileSync('.env.example', 'utf8');

    for (const key of requiredKeys) {
      expect(file).toContain(`${key}=`);
    }

    expect(file).not.toMatch(/uak_[A-Za-z0-9]+/);
    expect(file).not.toMatch(/sk-[A-Za-z0-9]+/);
    expect(file).not.toMatch(/xox[baprs]-/);
    expect(file).not.toMatch(/AC[a-f0-9]{32}/i);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run:

```bash
npm test -- tests/backend/env-example.test.ts
```

Expected: FAIL because `.env.example` does not exist.

- [ ] **Step 5: Create the env example**

Create `.env.example`:

```bash
# InsForge public client configuration
INSFORGE_BASE_URL=
INSFORGE_ANON_KEY=

# Server-side model gateway key. Keep out of browser bundles.
OPENROUTER_API_KEY=

# Internal function dispatch secret generated with: openssl rand -hex 32
AGENT_INTERNAL_SECRET=

# Optional real contractor search. Empty value enables mock search.
SERPAPI_KEY=

# Optional WhatsApp messaging. Empty values enable mock notification records.
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=

# Optional Telegram messaging. Empty value enables mock notification records.
TELEGRAM_BOT_TOKEN=
```

- [ ] **Step 6: Run the test to verify it passes**

Run:

```bash
npm test -- tests/backend/env-example.test.ts
npm run typecheck
```

Expected: PASS for the env test and PASS for TypeScript typecheck.

- [ ] **Step 7: Commit**

Run:

```bash
git add .env.example .gitignore package.json package-lock.json tsconfig.json vitest.config.ts tests/backend/env-example.test.ts
git commit -m "chore: add backend test harness"
```

## Task 2: Database Migration With RLS

**Files:**
- Create: `tests/backend/migration.test.ts`
- Create: `migrations/20260606190000_create_agentrabbit_backend.sql`

- [ ] **Step 1: Write the failing migration coverage test**

Create `tests/backend/migration.test.ts`:

```typescript
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'migrations/20260606190000_create_agentrabbit_backend.sql';

describe('AgentRabbit backend migration', () => {
  it('creates the expected tables and auth-owned user references', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    for (const table of [
      'profiles',
      'repair_requests',
      'request_messages',
      'agent_jobs',
      'contractors',
      'contractor_notifications',
    ]) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }

    expect(sql).toContain('references auth.users(id) on delete cascade');
    expect(sql).toContain('auth.uid()');
    expect(sql).toContain('id uuid primary key references auth.users(id) on delete cascade');
    expect(sql).toContain('user_id uuid not null references auth.users(id) on delete cascade');
  });

  it('defines request ownership policies for user-owned tables', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('profiles_select_own');
    expect(sql).toContain('repair_requests_select_own');
    expect(sql).toContain('request_messages_select_own');
    expect(sql).toContain('agent_jobs_select_own');
    expect(sql).toContain('contractor_notifications_select_own');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- tests/backend/migration.test.ts
```

Expected: FAIL because `migrations/20260606190000_create_agentrabbit_backend.sql` does not exist.

- [ ] **Step 3: Create the migration**

Create `migrations/20260606190000_create_agentrabbit_backend.sql`:

```sql
create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.repair_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'uploaded',
  category text,
  urgency text not null default 'normal',
  location_text text,
  image_url text not null,
  image_key text not null,
  model_name text,
  diagnosis text,
  next_question text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint repair_requests_status_check check (status in ('uploaded', 'needs_info', 'identified', 'searching', 'notifying', 'completed', 'failed')),
  constraint repair_requests_urgency_check check (urgency in ('low', 'normal', 'high', 'emergency'))
);

create table if not exists public.request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.repair_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  message_type text not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint request_messages_role_check check (role in ('user', 'assistant', 'system')),
  constraint request_messages_type_check check (message_type in ('text', 'image', 'analysis', 'search', 'notification', 'error'))
);

create table if not exists public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.repair_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  job_type text not null,
  status text not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0,
  last_error text,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_jobs_type_check check (job_type in ('analyze_image', 'search_contractors', 'notify_contractors')),
  constraint agent_jobs_status_check check (status in ('pending', 'running', 'succeeded', 'failed')),
  constraint agent_jobs_attempt_count_check check (attempt_count >= 0)
);

create table if not exists public.contractors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  website text,
  category text not null,
  location_text text,
  source text not null,
  source_ref text,
  created_at timestamptz not null default now(),
  constraint contractors_source_check check (source in ('serpapi', 'mock', 'manual'))
);

create table if not exists public.contractor_notifications (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.repair_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  contractor_id uuid references public.contractors(id),
  channel text not null,
  destination text,
  status text not null,
  message text not null,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contractor_notifications_channel_check check (channel in ('whatsapp', 'telegram', 'mock')),
  constraint contractor_notifications_status_check check (status in ('pending', 'sent', 'failed', 'mock_sent'))
);

create index if not exists repair_requests_user_created_idx on public.repair_requests (user_id, created_at desc);
create index if not exists repair_requests_status_idx on public.repair_requests (status);
create index if not exists request_messages_request_created_idx on public.request_messages (request_id, created_at);
create index if not exists agent_jobs_user_status_run_idx on public.agent_jobs (user_id, status, run_after, created_at);
create index if not exists contractor_notifications_request_idx on public.contractor_notifications (request_id, created_at);
create index if not exists contractors_category_location_idx on public.contractors (category, location_text);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists repair_requests_set_updated_at on public.repair_requests;
create trigger repair_requests_set_updated_at
before update on public.repair_requests
for each row execute function public.set_updated_at();

drop trigger if exists agent_jobs_set_updated_at on public.agent_jobs;
create trigger agent_jobs_set_updated_at
before update on public.agent_jobs
for each row execute function public.set_updated_at();

drop trigger if exists contractor_notifications_set_updated_at on public.contractor_notifications;
create trigger contractor_notifications_set_updated_at
before update on public.contractor_notifications
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.repair_requests enable row level security;
alter table public.request_messages enable row level security;
alter table public.agent_jobs enable row level security;
alter table public.contractors enable row level security;
alter table public.contractor_notifications enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
for select to authenticated
using (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
for insert to authenticated
with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists repair_requests_select_own on public.repair_requests;
create policy repair_requests_select_own on public.repair_requests
for select to authenticated
using (user_id = auth.uid());

drop policy if exists repair_requests_insert_own on public.repair_requests;
create policy repair_requests_insert_own on public.repair_requests
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists repair_requests_update_own on public.repair_requests;
create policy repair_requests_update_own on public.repair_requests
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists request_messages_select_own on public.request_messages;
create policy request_messages_select_own on public.request_messages
for select to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1 from public.repair_requests
    where repair_requests.id = request_messages.request_id
      and repair_requests.user_id = auth.uid()
  )
);

drop policy if exists request_messages_insert_own on public.request_messages;
create policy request_messages_insert_own on public.request_messages
for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.repair_requests
    where repair_requests.id = request_messages.request_id
      and repair_requests.user_id = auth.uid()
  )
);

drop policy if exists agent_jobs_select_own on public.agent_jobs;
create policy agent_jobs_select_own on public.agent_jobs
for select to authenticated
using (user_id = auth.uid());

drop policy if exists agent_jobs_insert_own on public.agent_jobs;
create policy agent_jobs_insert_own on public.agent_jobs
for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.repair_requests
    where repair_requests.id = agent_jobs.request_id
      and repair_requests.user_id = auth.uid()
  )
);

drop policy if exists agent_jobs_update_own on public.agent_jobs;
create policy agent_jobs_update_own on public.agent_jobs
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists contractors_select_authenticated on public.contractors;
create policy contractors_select_authenticated on public.contractors
for select to authenticated
using (true);

drop policy if exists contractors_insert_authenticated on public.contractors;
create policy contractors_insert_authenticated on public.contractors
for insert to authenticated
with check (true);

drop policy if exists contractor_notifications_select_own on public.contractor_notifications;
create policy contractor_notifications_select_own on public.contractor_notifications
for select to authenticated
using (user_id = auth.uid());

drop policy if exists contractor_notifications_insert_own on public.contractor_notifications;
create policy contractor_notifications_insert_own on public.contractor_notifications
for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.repair_requests
    where repair_requests.id = contractor_notifications.request_id
      and repair_requests.user_id = auth.uid()
  )
);

drop policy if exists contractor_notifications_update_own on public.contractor_notifications;
create policy contractor_notifications_update_own on public.contractor_notifications
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
```

- [ ] **Step 4: Run local migration tests**

Run:

```bash
npm test -- tests/backend/migration.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add migrations/20260606190000_create_agentrabbit_backend.sql tests/backend/migration.test.ts
git commit -m "feat: add InsForge backend schema"
```

## Task 3: Shared Function Logic

**Files:**
- Create: `functions/_shared/types.ts`
- Create: `functions/_shared/http.ts`
- Create: `functions/_shared/analysis.ts`
- Create: `functions/_shared/search.ts`
- Create: `functions/_shared/notifications.ts`
- Create: `functions/_shared/jobs.ts`
- Create: `tests/backend/analysis.test.ts`
- Create: `tests/backend/search.test.ts`
- Create: `tests/backend/notifications.test.ts`
- Create: `tests/backend/jobs.test.ts`

- [ ] **Step 1: Write failing tests for pure backend helpers**

Create `tests/backend/analysis.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { mockAnalyzeImage, normalizeAnalysisResponse } from '../../functions/_shared/analysis.ts';

describe('analysis helpers', () => {
  it('normalizes identified model output', () => {
    const result = normalizeAnalysisResponse(`{
      "status": "identified",
      "category": "HVAC",
      "model": "Carrier 5000",
      "diagnosis": "The condenser appears damaged.",
      "message": "I found it. Looking for HVAC contractors."
    }`);

    expect(result).toEqual({
      status: 'identified',
      category: 'HVAC',
      model: 'Carrier 5000',
      diagnosis: 'The condenser appears damaged.',
      message: 'I found it. Looking for HVAC contractors.',
    });
  });

  it('normalizes needs-info model output', () => {
    const result = normalizeAnalysisResponse('```json\n{"status":"needs_info","message":"Can you upload the model sticker?"}\n```');

    expect(result).toEqual({
      status: 'needs_info',
      message: 'Can you upload the model sticker?',
    });
  });

  it('returns a deterministic mock analysis result', () => {
    expect(mockAnalyzeImage('https://example.test/photo.jpg').status).toBe('identified');
  });
});
```

Create `tests/backend/search.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { buildContractorSearchQuery, mockContractors, parseSerpApiLocalResults } from '../../functions/_shared/search.ts';

describe('search helpers', () => {
  it('builds a contractor query from category and location', () => {
    expect(buildContractorSearchQuery('HVAC', 'San Francisco, CA')).toBe('HVAC repair contractors near San Francisco, CA');
  });

  it('returns three mock contractors', () => {
    const results = mockContractors('electrical', 'Oakland, CA');

    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({
      category: 'electrical',
      location_text: 'Oakland, CA',
      source: 'mock',
    });
  });

  it('parses SerpApi local results', () => {
    const parsed = parseSerpApiLocalResults({
      local_results: [
        { title: 'Fast HVAC', phone: '+14155550100', website: 'https://fast.example', place_id: 'abc' },
      ],
    }, 'HVAC', 'San Francisco, CA');

    expect(parsed).toEqual([
      {
        name: 'Fast HVAC',
        phone: '+14155550100',
        website: 'https://fast.example',
        category: 'HVAC',
        location_text: 'San Francisco, CA',
        source: 'serpapi',
        source_ref: 'abc',
      },
    ]);
  });
});
```

Create `tests/backend/notifications.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { buildContractorMessage } from '../../functions/_shared/notifications.ts';

describe('notification helpers', () => {
  it('builds a concise contractor outreach message', () => {
    const message = buildContractorMessage({
      category: 'HVAC',
      urgency: 'high',
      location_text: 'San Francisco, CA',
      diagnosis: 'Condenser fan is not spinning.',
      image_url: 'https://example.test/repair.jpg',
    });

    expect(message).toContain('HVAC');
    expect(message).toContain('high');
    expect(message).toContain('San Francisco, CA');
    expect(message).toContain('Condenser fan is not spinning.');
    expect(message).toContain('https://example.test/repair.jpg');
  });
});
```

Create `tests/backend/jobs.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { getNextRunAfter, shouldRetryJob } from '../../functions/_shared/jobs.ts';

describe('job helpers', () => {
  it('allows retry before the max attempt count', () => {
    expect(shouldRetryJob(1, 3)).toBe(true);
    expect(shouldRetryJob(3, 3)).toBe(false);
  });

  it('backs off in seconds based on attempts', () => {
    const base = new Date('2026-06-06T12:00:00.000Z');
    expect(getNextRunAfter(base, 1).toISOString()).toBe('2026-06-06T12:00:10.000Z');
    expect(getNextRunAfter(base, 3).toISOString()).toBe('2026-06-06T12:01:30.000Z');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/backend/analysis.test.ts tests/backend/search.test.ts tests/backend/notifications.test.ts tests/backend/jobs.test.ts
```

Expected: FAIL because the shared modules do not exist.

- [ ] **Step 3: Create shared types and helpers**

Create `functions/_shared/types.ts`:

```typescript
export type RepairStatus = 'uploaded' | 'needs_info' | 'identified' | 'searching' | 'notifying' | 'completed' | 'failed';
export type JobStatus = 'pending' | 'running' | 'succeeded' | 'failed';
export type JobType = 'analyze_image' | 'search_contractors' | 'notify_contractors';

export type RepairRequest = {
  id: string;
  user_id: string;
  status: RepairStatus;
  category: string | null;
  urgency: 'low' | 'normal' | 'high' | 'emergency';
  location_text: string | null;
  image_url: string;
  image_key: string;
  model_name: string | null;
  diagnosis: string | null;
  next_question: string | null;
};

export type AgentJob = {
  id: string;
  request_id: string;
  user_id: string;
  job_type: JobType;
  status: JobStatus;
  payload: Record<string, unknown>;
  attempt_count: number;
  last_error: string | null;
};

export type ContractorResult = {
  name: string;
  phone: string | null;
  website: string | null;
  category: string;
  location_text: string | null;
  source: 'serpapi' | 'mock' | 'manual';
  source_ref: string | null;
};

export type AnalysisResult =
  | {
      status: 'identified';
      category: string;
      model: string;
      diagnosis: string;
      message: string;
    }
  | {
      status: 'needs_info';
      message: string;
    };
```

Create `functions/_shared/http.ts`:

```typescript
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Agent-Internal-Secret',
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

export async function readJsonBody<T extends Record<string, unknown>>(request: Request): Promise<T> {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('JSON body must be an object.');
    }
    return body as T;
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
}

export function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }
  return authorization.slice('Bearer '.length).trim() || null;
}

export function getRequiredEnv(getter: (key: string) => string | undefined, key: string): string {
  const value = getter(key);
  if (!value) {
    throw new Error(`${key} is not configured.`);
  }
  return value;
}
```

Create `functions/_shared/analysis.ts`:

```typescript
import type { AnalysisResult } from './types.ts';

export function buildVisionPrompt(): string {
  return [
    'You are an expert home-maintenance triage assistant.',
    'Inspect the uploaded image and return strict JSON.',
    'If the image is sufficient, return {"status":"identified","category":"HVAC|electrical|plumbing|appliance|unknown","model":"short model or unknown","diagnosis":"short diagnosis","message":"short user-facing message"}.',
    'If the image is not sufficient, return {"status":"needs_info","message":"specific next photo or detail to ask for"}.',
  ].join('\n');
}

export function normalizeAnalysisResponse(raw: string): AnalysisResult {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;

  if (parsed.status === 'needs_info') {
    const message = typeof parsed.message === 'string' ? parsed.message.trim() : '';
    if (!message) {
      throw new Error('needs_info response requires a message.');
    }
    return { status: 'needs_info', message };
  }

  if (parsed.status === 'identified') {
    const category = typeof parsed.category === 'string' ? parsed.category.trim() : '';
    const model = typeof parsed.model === 'string' ? parsed.model.trim() : 'unknown';
    const diagnosis = typeof parsed.diagnosis === 'string' ? parsed.diagnosis.trim() : '';
    const message = typeof parsed.message === 'string' ? parsed.message.trim() : '';

    if (!category || !diagnosis || !message) {
      throw new Error('identified response requires category, diagnosis, and message.');
    }

    return { status: 'identified', category, model, diagnosis, message };
  }

  throw new Error('Analysis response status must be identified or needs_info.');
}

export function mockAnalyzeImage(imageUrl: string): AnalysisResult {
  const lower = imageUrl.toLowerCase();

  if (lower.includes('sticker') || lower.includes('label')) {
    return {
      status: 'identified',
      category: 'HVAC',
      model: 'Carrier Performance Series',
      diagnosis: 'The unit label is visible. The issue likely needs HVAC technician inspection.',
      message: 'I found the model details. Looking for HVAC contractors now.',
    };
  }

  return {
    status: 'identified',
    category: 'HVAC',
    model: 'unknown',
    diagnosis: 'The photo suggests an outdoor HVAC condenser issue. A technician should inspect the fan, capacitor, and wiring.',
    message: 'I can identify this as an HVAC issue. Looking for local HVAC contractors now.',
  };
}
```

Create `functions/_shared/search.ts`:

```typescript
import type { ContractorResult } from './types.ts';

type SerpApiLocalResult = {
  title?: string;
  phone?: string;
  website?: string;
  place_id?: string;
  data_id?: string;
};

export function buildContractorSearchQuery(category: string, location: string): string {
  return `${category} repair contractors near ${location}`;
}

export function mockContractors(category: string, locationText: string | null): ContractorResult[] {
  const location = locationText || 'your area';
  const normalizedCategory = category || 'maintenance';

  return [
    {
      name: `Rapid ${normalizedCategory} Pros`,
      phone: '+14155550101',
      website: 'https://example.com/rapid-pros',
      category: normalizedCategory,
      location_text: location,
      source: 'mock',
      source_ref: 'mock-rapid-pros',
    },
    {
      name: `${location} Home Repair Co`,
      phone: '+14155550102',
      website: 'https://example.com/home-repair',
      category: normalizedCategory,
      location_text: location,
      source: 'mock',
      source_ref: 'mock-home-repair',
    },
    {
      name: `Same Day ${normalizedCategory} Service`,
      phone: '+14155550103',
      website: 'https://example.com/same-day-service',
      category: normalizedCategory,
      location_text: location,
      source: 'mock',
      source_ref: 'mock-same-day-service',
    },
  ];
}

export function parseSerpApiLocalResults(payload: unknown, category: string, locationText: string | null): ContractorResult[] {
  const body = payload as { local_results?: SerpApiLocalResult[] };
  const results = Array.isArray(body.local_results) ? body.local_results : [];

  return results
    .filter((result) => typeof result.title === 'string' && result.title.trim().length > 0)
    .slice(0, 3)
    .map((result) => ({
      name: result.title!.trim(),
      phone: result.phone ?? null,
      website: result.website ?? null,
      category,
      location_text: locationText,
      source: 'serpapi' as const,
      source_ref: result.place_id ?? result.data_id ?? result.website ?? result.title ?? null,
    }));
}
```

Create `functions/_shared/notifications.ts`:

```typescript
type MessageInput = {
  category: string | null;
  urgency: string;
  location_text: string | null;
  diagnosis: string | null;
  image_url: string;
};

export function buildContractorMessage(input: MessageInput): string {
  const category = input.category || 'home maintenance';
  const location = input.location_text || 'the customer location';
  const diagnosis = input.diagnosis || 'The customer uploaded a repair photo for review.';

  return [
    `New ${category} repair lead.`,
    `Urgency: ${input.urgency}.`,
    `Location: ${location}.`,
    `Issue: ${diagnosis}`,
    `Photo: ${input.image_url}`,
    'Reply with availability and an estimated price range.',
  ].join(' ');
}
```

Create `functions/_shared/jobs.ts`:

```typescript
export function shouldRetryJob(attemptCount: number, maxAttempts: number): boolean {
  return attemptCount < maxAttempts;
}

export function getNextRunAfter(now: Date, attemptCount: number): Date {
  const seconds = Math.min(90, Math.max(10, attemptCount * attemptCount * 10));
  return new Date(now.getTime() + seconds * 1000);
}
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
npm test -- tests/backend/analysis.test.ts tests/backend/search.test.ts tests/backend/notifications.test.ts tests/backend/jobs.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add functions/_shared tests/backend/analysis.test.ts tests/backend/search.test.ts tests/backend/notifications.test.ts tests/backend/jobs.test.ts
git commit -m "feat: add backend shared helpers"
```

## Task 4: Analyze Edge Function

**Files:**
- Create: `functions/analyze.ts`

- [ ] **Step 1: Create the analyze Edge Function**

Create `functions/analyze.ts`:

```typescript
import { createClient } from 'npm:@insforge/sdk';
import OpenAI from 'npm:openai';
import { buildVisionPrompt, mockAnalyzeImage, normalizeAnalysisResponse } from './_shared/analysis.ts';
import { corsHeaders, getBearerToken, getRequiredEnv, jsonResponse, readJsonBody } from './_shared/http.ts';
import type { AnalysisResult, RepairRequest } from './_shared/types.ts';

type AnalyzeBody = {
  requestId?: unknown;
};

async function analyzeWithOpenRouter(imageUrl: string): Promise<AnalysisResult> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) {
    return mockAnalyzeImage(imageUrl);
  }

  const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    defaultHeaders: {
      'X-Title': 'AgentRabbit',
    },
  });

  const completion = await openai.chat.completions.create({
    model: 'openai/gpt-4o',
    messages: [
      { role: 'system', content: buildVisionPrompt() },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analyze this repair photo and return strict JSON.' },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
  });

  return normalizeAnalysisResponse(completion.choices[0]?.message?.content ?? '');
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const token = getBearerToken(request);
    if (!token) {
      return jsonResponse({ error: 'Unauthorized.' }, 401);
    }

    const body = await readJsonBody<AnalyzeBody>(request);
    const requestId = typeof body.requestId === 'string' ? body.requestId : '';
    if (!requestId) {
      return jsonResponse({ error: 'requestId is required.' }, 400);
    }

    const client = createClient({
      baseUrl: getRequiredEnv((key) => Deno.env.get(key), 'INSFORGE_BASE_URL'),
      edgeFunctionToken: token,
    });

    const { data: userData } = await client.auth.getCurrentUser();
    const user = userData?.user;
    if (!user?.id) {
      return jsonResponse({ error: 'Unauthorized.' }, 401);
    }

    const { data: requests, error: requestError } = await client.database
      .from('repair_requests')
      .select('*')
      .eq('id', requestId)
      .eq('user_id', user.id)
      .limit(1);

    if (requestError) {
      throw requestError;
    }

    const repairRequest = (requests?.[0] ?? null) as RepairRequest | null;
    if (!repairRequest) {
      return jsonResponse({ error: 'Repair request not found.' }, 404);
    }

    await client.database.from('request_messages').insert([{
      request_id: requestId,
      user_id: user.id,
      role: 'system',
      message_type: 'analysis',
      content: 'Analyzing the repair photo.',
      metadata: {},
    }]);

    const result = await analyzeWithOpenRouter(repairRequest.image_url);

    if (result.status === 'needs_info') {
      await client.database
        .from('repair_requests')
        .update({
          status: 'needs_info',
          next_question: result.message,
        })
        .eq('id', requestId)
        .eq('user_id', user.id);

      await client.database.from('request_messages').insert([{
        request_id: requestId,
        user_id: user.id,
        role: 'assistant',
        message_type: 'analysis',
        content: result.message,
        metadata: { status: result.status },
      }]);

      return jsonResponse({
        status: 'needs_info',
        message: result.message,
      });
    }

    await client.database
      .from('repair_requests')
      .update({
        status: 'identified',
        category: result.category,
        model_name: result.model,
        diagnosis: result.diagnosis,
        next_question: null,
      })
      .eq('id', requestId)
      .eq('user_id', user.id);

    await client.database.from('request_messages').insert([{
      request_id: requestId,
      user_id: user.id,
      role: 'assistant',
      message_type: 'analysis',
      content: result.message,
      metadata: {
        status: result.status,
        category: result.category,
        model: result.model,
        diagnosis: result.diagnosis,
      },
    }]);

    await client.database.from('agent_jobs').insert([{
      request_id: requestId,
      user_id: user.id,
      job_type: 'search_contractors',
      status: 'pending',
      payload: {
        category: result.category,
        location_text: repairRequest.location_text,
      },
    }]);

    return jsonResponse({
      status: 'identified',
      category: result.category,
      model: result.model,
      message: result.message,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Analyze failed.';
    return jsonResponse({ error: message }, 500);
  }
}
```

- [ ] **Step 2: Run local checks**

Run:

```bash
npm run typecheck
npm test
```

Expected: PASS.

- [ ] **Step 3: Commit**

Run:

```bash
git add functions/analyze.ts
git commit -m "feat: add analyze edge function"
```

## Task 5: Search Contractors Edge Function

**Files:**
- Create: `functions/search-contractors.ts`

- [ ] **Step 1: Create the search Edge Function**

Create `functions/search-contractors.ts`:

```typescript
import { createClient } from 'npm:@insforge/sdk';
import { buildContractorSearchQuery, mockContractors, parseSerpApiLocalResults } from './_shared/search.ts';
import { corsHeaders, getBearerToken, getRequiredEnv, jsonResponse, readJsonBody } from './_shared/http.ts';
import type { ContractorResult, RepairRequest } from './_shared/types.ts';

type SearchBody = {
  requestId?: unknown;
};

async function findContractors(category: string, locationText: string | null): Promise<ContractorResult[]> {
  const apiKey = Deno.env.get('SERPAPI_KEY');
  if (!apiKey) {
    return mockContractors(category, locationText);
  }

  const location = locationText || 'United States';
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google_maps');
  url.searchParams.set('q', buildContractorSearchQuery(category, location));
  url.searchParams.set('api_key', apiKey);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`SerpApi failed with HTTP ${response.status}.`);
  }

  const parsed = parseSerpApiLocalResults(await response.json(), category, locationText);
  return parsed.length > 0 ? parsed : mockContractors(category, locationText);
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const token = getBearerToken(request);
    if (!token) {
      return jsonResponse({ error: 'Unauthorized.' }, 401);
    }

    const body = await readJsonBody<SearchBody>(request);
    const requestId = typeof body.requestId === 'string' ? body.requestId : '';
    if (!requestId) {
      return jsonResponse({ error: 'requestId is required.' }, 400);
    }

    const client = createClient({
      baseUrl: getRequiredEnv((key) => Deno.env.get(key), 'INSFORGE_BASE_URL'),
      edgeFunctionToken: token,
    });

    const { data: userData } = await client.auth.getCurrentUser();
    const user = userData?.user;
    if (!user?.id) {
      return jsonResponse({ error: 'Unauthorized.' }, 401);
    }

    const { data: requests, error: requestError } = await client.database
      .from('repair_requests')
      .select('*')
      .eq('id', requestId)
      .eq('user_id', user.id)
      .limit(1);

    if (requestError) {
      throw requestError;
    }

    const repairRequest = (requests?.[0] ?? null) as RepairRequest | null;
    if (!repairRequest) {
      return jsonResponse({ error: 'Repair request not found.' }, 404);
    }

    const category = repairRequest.category || 'home maintenance';
    const contractors = await findContractors(category, repairRequest.location_text);
    const { data: insertedContractors, error: insertError } = await client.database
      .from('contractors')
      .insert(contractors)
      .select();

    if (insertError) {
      throw insertError;
    }

    const contractorIds = (insertedContractors ?? []).map((contractor: { id: string }) => contractor.id);

    await client.database
      .from('repair_requests')
      .update({ status: 'notifying' })
      .eq('id', requestId)
      .eq('user_id', user.id);

    await client.database.from('request_messages').insert([{
      request_id: requestId,
      user_id: user.id,
      role: 'system',
      message_type: 'search',
      content: `Found ${contractors.length} ${category} contractors near ${repairRequest.location_text || 'your area'}.`,
      metadata: { contractorIds },
    }]);

    await client.database.from('agent_jobs').insert([{
      request_id: requestId,
      user_id: user.id,
      job_type: 'notify_contractors',
      status: 'pending',
      payload: { contractorIds },
    }]);

    return jsonResponse({ contractors: insertedContractors ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Contractor search failed.';
    return jsonResponse({ error: message }, 500);
  }
}
```

- [ ] **Step 2: Run local checks**

Run:

```bash
npm run typecheck
npm test
```

Expected: PASS.

- [ ] **Step 3: Commit**

Run:

```bash
git add functions/search-contractors.ts
git commit -m "feat: add contractor search function"
```

## Task 6: Notify Contractors Edge Function

**Files:**
- Create: `functions/notify-contractors.ts`

- [ ] **Step 1: Create the notification Edge Function**

Create `functions/notify-contractors.ts`:

```typescript
import { createClient } from 'npm:@insforge/sdk';
import { buildContractorMessage } from './_shared/notifications.ts';
import { corsHeaders, getBearerToken, getRequiredEnv, jsonResponse, readJsonBody } from './_shared/http.ts';
import type { RepairRequest } from './_shared/types.ts';

type NotifyBody = {
  requestId?: unknown;
  contractorIds?: unknown;
};

type ContractorRecord = {
  id: string;
  name: string;
  phone: string | null;
};

async function sendTwilioWhatsApp(to: string, body: string): Promise<string | null> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from = Deno.env.get('TWILIO_WHATSAPP_FROM');
  if (!accountSid || !authToken || !from) {
    return null;
  }

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      From: from,
      To: `whatsapp:${to}`,
      Body: body,
    }),
  });

  if (!response.ok) {
    throw new Error(`Twilio failed with HTTP ${response.status}.`);
  }

  const payload = await response.json() as { sid?: string };
  return payload.sid ?? null;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const token = getBearerToken(request);
    if (!token) {
      return jsonResponse({ error: 'Unauthorized.' }, 401);
    }

    const body = await readJsonBody<NotifyBody>(request);
    const requestId = typeof body.requestId === 'string' ? body.requestId : '';
    const contractorIds = Array.isArray(body.contractorIds)
      ? body.contractorIds.filter((value): value is string => typeof value === 'string')
      : [];

    if (!requestId || contractorIds.length === 0) {
      return jsonResponse({ error: 'requestId and contractorIds are required.' }, 400);
    }

    const client = createClient({
      baseUrl: getRequiredEnv((key) => Deno.env.get(key), 'INSFORGE_BASE_URL'),
      edgeFunctionToken: token,
    });

    const { data: userData } = await client.auth.getCurrentUser();
    const user = userData?.user;
    if (!user?.id) {
      return jsonResponse({ error: 'Unauthorized.' }, 401);
    }

    const { data: requests, error: requestError } = await client.database
      .from('repair_requests')
      .select('*')
      .eq('id', requestId)
      .eq('user_id', user.id)
      .limit(1);

    if (requestError) {
      throw requestError;
    }

    const repairRequest = (requests?.[0] ?? null) as RepairRequest | null;
    if (!repairRequest) {
      return jsonResponse({ error: 'Repair request not found.' }, 404);
    }

    const { data: contractors, error: contractorsError } = await client.database
      .from('contractors')
      .select('*')
      .in('id', contractorIds);

    if (contractorsError) {
      throw contractorsError;
    }

    const message = buildContractorMessage(repairRequest);
    let notifiedCount = 0;

    for (const contractor of (contractors ?? []) as ContractorRecord[]) {
      try {
        const providerMessageId = contractor.phone ? await sendTwilioWhatsApp(contractor.phone, message) : null;
        const status = providerMessageId ? 'sent' : 'mock_sent';
        const channel = providerMessageId ? 'whatsapp' : 'mock';

        await client.database.from('contractor_notifications').insert([{
          request_id: requestId,
          user_id: user.id,
          contractor_id: contractor.id,
          channel,
          destination: contractor.phone,
          status,
          message,
          provider_message_id: providerMessageId,
        }]);

        notifiedCount += 1;
      } catch (error) {
        const lastError = error instanceof Error ? error.message : 'Notification failed.';
        await client.database.from('contractor_notifications').insert([{
          request_id: requestId,
          user_id: user.id,
          contractor_id: contractor.id,
          channel: 'whatsapp',
          destination: contractor.phone,
          status: 'failed',
          message,
          last_error: lastError,
        }]);
      }
    }

    await client.database
      .from('repair_requests')
      .update({ status: 'completed' })
      .eq('id', requestId)
      .eq('user_id', user.id);

    await client.database.from('request_messages').insert([{
      request_id: requestId,
      user_id: user.id,
      role: 'system',
      message_type: 'notification',
      content: `Contacted ${notifiedCount} contractors.`,
      metadata: { contractorIds },
    }]);

    return jsonResponse({ success: true, notifiedCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Contractor notification failed.';
    return jsonResponse({ error: message }, 500);
  }
}
```

- [ ] **Step 2: Run local checks**

Run:

```bash
npm run typecheck
npm test
```

Expected: PASS.

- [ ] **Step 3: Commit**

Run:

```bash
git add functions/notify-contractors.ts
git commit -m "feat: add contractor notification function"
```

## Task 7: Agent Job Processor

**Files:**
- Create: `functions/process-agent-jobs.ts`

- [ ] **Step 1: Create the job processor Edge Function**

Create `functions/process-agent-jobs.ts`:

```typescript
import { createClient } from 'npm:@insforge/sdk';
import { getNextRunAfter, shouldRetryJob } from './_shared/jobs.ts';
import { corsHeaders, getBearerToken, getRequiredEnv, jsonResponse, readJsonBody } from './_shared/http.ts';
import type { AgentJob } from './_shared/types.ts';

type ProcessBody = {
  limit?: unknown;
};

const maxAttempts = 3;

async function invokeFunction(slug: string, token: string, payload: Record<string, unknown>): Promise<void> {
  const baseUrl = getRequiredEnv((key) => Deno.env.get(key), 'INSFORGE_BASE_URL');
  const internalSecret = getRequiredEnv((key) => Deno.env.get(key), 'AGENT_INTERNAL_SECRET');
  const response = await fetch(`${baseUrl}/functions/${slug}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Agent-Internal-Secret': internalSecret,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${slug} failed with HTTP ${response.status}: ${body}`);
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const token = getBearerToken(request);
    if (!token) {
      return jsonResponse({ error: 'Unauthorized.' }, 401);
    }

    const body = await readJsonBody<ProcessBody>(request);
    const limit = typeof body.limit === 'number' && body.limit > 0 ? Math.min(body.limit, 10) : 3;

    const client = createClient({
      baseUrl: getRequiredEnv((key) => Deno.env.get(key), 'INSFORGE_BASE_URL'),
      edgeFunctionToken: token,
    });

    const { data: userData } = await client.auth.getCurrentUser();
    const user = userData?.user;
    if (!user?.id) {
      return jsonResponse({ error: 'Unauthorized.' }, 401);
    }

    const { data: jobs, error: jobsError } = await client.database
      .from('agent_jobs')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .lte('run_after', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(limit);

    if (jobsError) {
      throw jobsError;
    }

    const results: Array<{ jobId: string; status: 'succeeded' | 'failed' | 'retrying'; error?: string }> = [];

    for (const job of (jobs ?? []) as AgentJob[]) {
      const nextAttemptCount = job.attempt_count + 1;

      await client.database
        .from('agent_jobs')
        .update({
          status: 'running',
          attempt_count: nextAttemptCount,
          locked_at: new Date().toISOString(),
          last_error: null,
        })
        .eq('id', job.id)
        .eq('user_id', user.id);

      try {
        if (job.job_type === 'search_contractors') {
          await invokeFunction('search-contractors', token, { requestId: job.request_id });
        } else if (job.job_type === 'notify_contractors') {
          const contractorIds = Array.isArray(job.payload.contractorIds) ? job.payload.contractorIds : [];
          await invokeFunction('notify-contractors', token, {
            requestId: job.request_id,
            contractorIds,
          });
        } else {
          throw new Error(`Unsupported job type: ${job.job_type}`);
        }

        await client.database
          .from('agent_jobs')
          .update({
            status: 'succeeded',
            locked_at: null,
          })
          .eq('id', job.id)
          .eq('user_id', user.id);

        results.push({ jobId: job.id, status: 'succeeded' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Job failed.';

        if (shouldRetryJob(nextAttemptCount, maxAttempts)) {
          await client.database
            .from('agent_jobs')
            .update({
              status: 'pending',
              run_after: getNextRunAfter(new Date(), nextAttemptCount).toISOString(),
              locked_at: null,
              last_error: message,
            })
            .eq('id', job.id)
            .eq('user_id', user.id);

          results.push({ jobId: job.id, status: 'retrying', error: message });
        } else {
          await client.database
            .from('agent_jobs')
            .update({
              status: 'failed',
              locked_at: null,
              last_error: message,
            })
            .eq('id', job.id)
            .eq('user_id', user.id);

          results.push({ jobId: job.id, status: 'failed', error: message });
        }
      }
    }

    return jsonResponse({ processed: results.length, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Job processing failed.';
    return jsonResponse({ error: message }, 500);
  }
}
```

- [ ] **Step 2: Run local checks**

Run:

```bash
npm run typecheck
npm test
```

Expected: PASS.

- [ ] **Step 3: Commit**

Run:

```bash
git add functions/process-agent-jobs.ts
git commit -m "feat: add agent job processor"
```

## Task 8: Bundle Edge Function Entrypoints

**Files:**
- Create: `scripts/bundle-functions.mjs`

- [ ] **Step 1: Create the bundler script**

Create `scripts/bundle-functions.mjs`:

```javascript
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';

const entries = [
  'analyze',
  'search-contractors',
  'notify-contractors',
  'process-agent-jobs',
];

await mkdir('dist/functions', { recursive: true });

for (const entry of entries) {
  await build({
    entryPoints: [`functions/${entry}.ts`],
    outfile: `dist/functions/${entry}.js`,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    external: ['npm:*'],
    logLevel: 'info',
  });
}
```

- [ ] **Step 2: Run the function bundle**

Run:

```bash
npm run build:functions
ls dist/functions
```

Expected: PASS, and `dist/functions` contains `analyze.js`, `search-contractors.js`, `notify-contractors.js`, and `process-agent-jobs.js`.

- [ ] **Step 3: Run local checks**

Run:

```bash
npm run typecheck
npm test
```

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```bash
git add scripts/bundle-functions.mjs
git commit -m "chore: bundle edge functions for deploy"
```

## Task 9: Link InsForge, Apply Backend Resources, And Deploy Functions

**Files:**
- Modify: `.env.example` only if the InsForge project exposes additional public keys that must be documented.

- [ ] **Step 1: Verify the linked InsForge project**

Run:

```bash
npx @insforge/cli current
```

Expected: `current` prints user `prufect <gadiraju.prudhvi@gmail.com>` and project `RobotRabbit` with API base `https://pzv974n7.us-east.insforge.app`. If the CLI is logged out, run `npx @insforge/cli login`, then run `npx @insforge/cli current` again.

- [ ] **Step 2: Confirm project metadata is readable**

Run:

```bash
npx @insforge/cli --json metadata > /tmp/agentrabbit-insforge-metadata.json
node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync('/tmp/agentrabbit-insforge-metadata.json','utf8')); console.log(Object.keys(data).join('\\n'))"
```

Expected: output includes backend metadata sections such as auth, database, buckets, or edge functions.

- [ ] **Step 3: Apply database migrations**

Run:

```bash
npx @insforge/cli db migrations up --all
npx @insforge/cli db migrations list
```

Expected: the migration `20260606190000_create_agentrabbit_backend` appears in the applied migration list.

- [ ] **Step 4: Create the private repair photo bucket**

Run:

```bash
npx @insforge/cli storage create-bucket repair-photos --private
npx @insforge/cli storage buckets
```

Expected: `repair-photos` appears in the bucket list and is private.

- [ ] **Step 5: Configure secrets**

Run:

```bash
export AGENT_INTERNAL_SECRET="$(openssl rand -hex 32)"
npx @insforge/cli secrets add AGENT_INTERNAL_SECRET "$AGENT_INTERNAL_SECRET"
npx @insforge/cli secrets list
```

Expected: `AGENT_INTERNAL_SECRET` appears in the secret metadata list.

When real integration keys are available, add only non-empty values:

```bash
for key in OPENROUTER_API_KEY SERPAPI_KEY TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_WHATSAPP_FROM TELEGRAM_BOT_TOKEN; do
  value="${!key:-}"
  if [ -n "$value" ]; then
    npx @insforge/cli secrets add "$key" "$value"
  fi
done
```

Expected: provided keys appear in `npx @insforge/cli secrets list`. Empty shell variables are skipped.

- [ ] **Step 6: Deploy Edge Functions**

Run:

```bash
npm run build:functions
npx @insforge/cli functions deploy analyze --file dist/functions/analyze.js --name "Analyze Repair Photo" --description "Authenticates the user, analyzes a repair photo, updates request state, and creates contractor-search jobs."
npx @insforge/cli functions deploy search-contractors --file dist/functions/search-contractors.js --name "Search Contractors" --description "Finds or mocks contractors for an identified repair request."
npx @insforge/cli functions deploy notify-contractors --file dist/functions/notify-contractors.js --name "Notify Contractors" --description "Sends or mocks contractor outreach and records notification outcomes."
npx @insforge/cli functions deploy process-agent-jobs --file dist/functions/process-agent-jobs.js --name "Process Agent Jobs" --description "Processes pending user-owned agent jobs."
npx @insforge/cli functions list
```

Expected: all four function slugs appear in the function list.

- [ ] **Step 7: Run diagnostics**

Run:

```bash
npx @insforge/cli diagnose --json > /tmp/agentrabbit-diagnose.json
node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync('/tmp/agentrabbit-diagnose.json','utf8')); console.log(JSON.stringify(data,null,2).slice(0,2000))"
```

Expected: diagnostics return JSON with no critical database, storage, or function deployment errors.

- [ ] **Step 8: Configure Google OAuth in InsForge Auth**

In the InsForge dashboard for the linked project:

1. Open Auth Methods.
2. Enable Google.
3. Save the Google OAuth client id and client secret.
4. Add the frontend callback URL used by the Next.js app after Google login.
5. Save.

Then run:

```bash
npx @insforge/cli --json metadata > /tmp/agentrabbit-auth-metadata.json
node -e "const fs=require('fs'); const text=fs.readFileSync('/tmp/agentrabbit-auth-metadata.json','utf8'); if(!/google/i.test(text)){process.exit(1)} console.log('Google auth metadata detected')"
```

Expected: `Google auth metadata detected`.

- [ ] **Step 9: Commit deployment-ready backend resources**

Run:

```bash
git status --short
git add .
git commit -m "chore: deploy InsForge backend resources"
```

Expected: commit succeeds if local files changed during this task. If `git status --short` is empty, skip the commit.

## Task 10: Manual Backend Smoke Test

**Files:**
- No source files.

- [ ] **Step 1: Create a Google-authenticated test session**

Use the frontend or a small local script once the frontend exists to sign in with Google through InsForge Auth. Capture the access token in the local shell:

```bash
test -n "$AGENTRABBIT_ACCESS_TOKEN"
```

Expected: `AGENTRABBIT_ACCESS_TOKEN` contains a valid InsForge user access token from Google login.

- [ ] **Step 2: Create a profile row and repair request with an authenticated one-off script**

Run:

```bash
node --input-type=module <<'NODE'
import { writeFileSync } from 'node:fs';
import { createClient } from '@insforge/sdk';

const baseUrl = process.env.INSFORGE_BASE_URL;
const token = process.env.AGENTRABBIT_ACCESS_TOKEN;
if (!baseUrl || !token) {
  throw new Error('INSFORGE_BASE_URL and AGENTRABBIT_ACCESS_TOKEN are required.');
}

const client = createClient({
  baseUrl,
  edgeFunctionToken: token,
});

const { data: userData, error: userError } = await client.auth.getCurrentUser();
if (userError) throw userError;
const user = userData?.user;
if (!user?.id) throw new Error('No authenticated user returned by InsForge.');

const profileValues = {
  id: user.id,
  email: user.email ?? 'test@example.com',
  full_name: user.name ?? 'Signed In User',
  avatar_url: user.avatar_url ?? null,
};
const { data: existingProfile } = await client.database
  .from('profiles')
  .select('id')
  .eq('id', user.id)
  .maybeSingle();
if (existingProfile) {
  await client.database.from('profiles').update(profileValues).eq('id', user.id);
} else {
  await client.database.from('profiles').insert([profileValues]);
}

const pngBytes = Uint8Array.from([
  137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,
  0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,
  0,0,0,10,73,68,65,84,120,156,99,0,1,0,0,5,0,1,
  13,10,42,184,0,0,0,0,73,69,78,68,174,66,96,130,
]);
const file = new File([pngBytes], 'repair-test.png', { type: 'image/png' });
const { data: upload, error: uploadError } = await client.storage.from('repair-photos').uploadAuto(file);
if (uploadError) throw uploadError;
if (!upload?.url || !upload?.key) throw new Error('Upload did not return url and key.');

const { data: inserted, error: insertError } = await client.database
  .from('repair_requests')
  .insert([{
    user_id: user.id,
    status: 'uploaded',
    urgency: 'high',
    location_text: 'San Francisco, CA',
    image_url: upload.url,
    image_key: upload.key,
  }])
  .select();
if (insertError) throw insertError;

const request = inserted?.[0];
if (!request?.id) throw new Error('Repair request insert did not return an id.');
writeFileSync('/tmp/agentrabbit-request.env', `export AGENTRABBIT_REQUEST_ID=${request.id}\n`);
console.log(`Created request ${request.id}`);
NODE
source /tmp/agentrabbit-request.env
```

Expected: the script creates a profile, uploads a tiny image to `repair-photos`, creates a `repair_requests` row, and exports `AGENTRABBIT_REQUEST_ID`.

- [ ] **Step 3: Invoke analyze**

Run:

```bash
curl -sS -X POST "$INSFORGE_BASE_URL/functions/analyze" \
  -H "Authorization: Bearer $AGENTRABBIT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"requestId\":\"$AGENTRABBIT_REQUEST_ID\"}" \
  | tee /tmp/agentrabbit-analyze.json
```

Expected: response has `status` equal to `identified` or `needs_info`. With no OpenRouter key, mock analysis returns `identified`.

- [ ] **Step 4: Process jobs twice**

Run:

```bash
curl -sS -X POST "$INSFORGE_BASE_URL/functions/process-agent-jobs" \
  -H "Authorization: Bearer $AGENTRABBIT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit":3}' \
  | tee /tmp/agentrabbit-jobs-1.json

curl -sS -X POST "$INSFORGE_BASE_URL/functions/process-agent-jobs" \
  -H "Authorization: Bearer $AGENTRABBIT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit":3}' \
  | tee /tmp/agentrabbit-jobs-2.json
```

Expected: the first call processes the `search_contractors` job, and the second call processes the `notify_contractors` job.

- [ ] **Step 5: Verify database outcomes**

Use the InsForge dashboard or SDK to verify:

- `repair_requests.status` is `completed` when mock search and mock notifications finish.
- `agent_jobs` has `search_contractors` and `notify_contractors` rows marked `succeeded`.
- `contractors` has three rows for the request category/location.
- `contractor_notifications` has three `mock_sent` rows when Twilio credentials are absent.
- `request_messages` includes analysis, search, and notification timeline entries.

- [ ] **Step 6: Verify RLS with a second user**

Sign in as a different Google user and attempt to read the first user's request through the SDK.

Expected: the second user receives no rows for the first user's `repair_requests`, `request_messages`, `agent_jobs`, and `contractor_notifications`.

- [ ] **Step 7: Commit smoke-test notes if a docs note was added**

Run:

```bash
git status --short
git add .
git commit -m "docs: record InsForge backend smoke test"
```

Expected: commit succeeds if a smoke-test note was added. If `git status --short` is empty, skip the commit.

## Execution Notes

- Run `npx @insforge/cli` commands through `npx`; do not install the CLI globally.
- Keep OpenRouter, SerpApi, Twilio, Telegram, and internal agent secrets out of committed files.
- Mock behavior is intentional for the hackathon path. Empty `SERPAPI_KEY` creates mock contractors. Empty Twilio credentials create `mock_sent` notification records.
- The `process-agent-jobs` function requires a user bearer token because the MVP updates user-owned rows through RLS. Scheduled service processing can be added later with a service-auth pattern once InsForge exposes the desired service credential workflow for this project.
- If a CLI command fails, run `npx @insforge/cli diagnose --json` and inspect function logs with `npx @insforge/cli logs function.logs`.
