# InsForge MCP Instructions

Fetched on 2026-06-06 from the InsForge MCP server for the linked `RobotRabbit` backend.

## Linked Backend

- Project: `RobotRabbit`
- API base URL: `https://pzv974n7.us-east.insforge.app`
- Backend version reported by MCP: `1.0.0`
- Installed MCP package: `@insforge/mcp@latest`

## MCP Docs Fetched

The MCP server was installed with:

```bash
npx @insforge/install --client codex --env API_KEY=... --env API_BASE_URL=https://pzv974n7.us-east.insforge.app
```

The InsForge namespace is available in Codex after installing the MCP server. These docs were fetched:

- `fetch-docs` with `docType: "instructions"`
- `fetch-sdk-docs` for `db` + `typescript`
- `fetch-sdk-docs` for `auth` + `typescript`
- `fetch-sdk-docs` for `storage` + `typescript`
- `fetch-sdk-docs` for `functions` + `typescript`
- `fetch-sdk-docs` for `ai` + `typescript`

## Must-Remember Rules

- Before writing or editing InsForge integration code, fetch current docs with `fetch-docs` or `fetch-sdk-docs`.
- Use the InsForge SDK for application logic: auth, database CRUD, storage, function invocation, and realtime.
- Use MCP or CLI for infrastructure: metadata, SQL/schema, storage buckets, function deployment, logs, and deployment.
- Create SDK clients with `createClient({ baseUrl, anonKey })` for browser/public operations.
- In Edge Functions, extract `Authorization: Bearer <token>` and create the SDK client with `edgeFunctionToken`.
- Call `auth.getCurrentUser()` inside authenticated Edge Functions before accessing user data.
- Database inserts should use array form, for example `insert([{ ... }])`.
- Database updates and deletes must be filtered with `.eq()`, `.in()`, or another filter.
- Store both Storage upload values: returned `url` and returned `key`.
- Invoke functions by slug; serverless functions do not support nested route paths.
- AI integrations should call OpenRouter directly from trusted server-side code with `baseURL: "https://openrouter.ai/api/v1"` and `OPENROUTER_API_KEY`.
- Do not expose `OPENROUTER_API_KEY` in browser bundles.
- The linked InsForge agent guidance says to reference users with `auth.users(id)` and use `auth.uid()` in RLS policies.

## Project Implications

- The AgentRabbit backend migration should use `uuid` user references to `auth.users(id)` for user-owned rows.
- RLS policies should use `auth.uid()`.
- Edge Function source should use `import { createClient } from "npm:@insforge/sdk";`.
- The plan should prefer mock fallbacks when `SERPAPI_KEY`, Twilio, or Telegram credentials are absent.
- The current project already has Google listed in backend auth metadata.
