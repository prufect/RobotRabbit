export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Agent-Internal-Secret',
};

export function optionsResponse(): Response {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

export async function parseJsonBody<T extends Record<string, unknown>>(req: Request): Promise<T> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' ? body as T : {} as T;
  } catch {
    return {} as T;
  }
}

export function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim() || null;
}

export function isInternalRequest(req: Request): boolean {
  const expected = Deno.env.get('AGENT_INTERNAL_SECRET');
  if (!expected) return false;
  return req.headers.get('X-Agent-Internal-Secret') === expected;
}

export function requirePost(req: Request): Response | null {
  if (req.method === 'OPTIONS') return optionsResponse();
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, { status: 405 });
  }
  return null;
}

export function edgeBaseUrl(): string {
  const baseUrl = Deno.env.get('INSFORGE_BASE_URL');
  if (!baseUrl) throw new Error('INSFORGE_BASE_URL is not configured');
  return baseUrl;
}

export function adminApiKey(): string {
  const apiKey = Deno.env.get('INSFORGE_API_KEY') ?? Deno.env.get('API_KEY');
  if (!apiKey) throw new Error('INSFORGE_API_KEY is not configured');
  return apiKey;
}
