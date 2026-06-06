import { createClient } from 'npm:@insforge/sdk';
import { chooseBestQuote } from './_shared/jobs.ts';
import { edgeBaseUrl, getBearerToken, jsonResponse, optionsResponse, parseJsonBody } from './_shared/http.ts';
import type { ContractorQuote, RepairRequest } from './_shared/types.ts';

type StatusBody = {
  requestId?: unknown;
};

export default async function status(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse();
  if (req.method !== 'POST' && req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const requestId = req.method === 'GET'
      ? new URL(req.url).searchParams.get('requestId')
      : (await parseJsonBody<StatusBody>(req)).requestId;

    if (typeof requestId !== 'string' || !requestId) {
      return jsonResponse({ error: 'requestId is required' }, { status: 400 });
    }

    const client = createClient({
      baseUrl: edgeBaseUrl(),
      edgeFunctionToken: getBearerToken(req),
    });

    const { data: userData } = await client.auth.getCurrentUser();
    const user = userData?.user;
    if (!user?.id) {
      return jsonResponse({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: request, error: requestError } = await client.database
      .from('repair_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (requestError || !request) {
      return jsonResponse({ error: 'Repair request not found' }, { status: 404 });
    }

    const repairRequest = request as RepairRequest & { created_at?: string; updated_at?: string };
    if (repairRequest.user_id !== user.id) {
      return jsonResponse({ error: 'Forbidden' }, { status: 403 });
    }

    const [{ data: quoteData }, { data: notificationData }, { data: messageData }, { data: jobData }] = await Promise.all([
      client.database.from('contractor_quotes').select('*').eq('request_id', requestId),
      client.database.from('contractor_notifications').select('*').eq('request_id', requestId),
      client.database.from('request_messages').select('*').eq('request_id', requestId).order('created_at', { ascending: true }),
      client.database.from('agent_jobs').select('*').eq('request_id', requestId).order('created_at', { ascending: true }),
    ]);

    const quotes = Array.isArray(quoteData) ? quoteData as Array<ContractorQuote & Record<string, unknown>> : [];
    const bestQuote = repairRequest.best_quote_id
      ? quotes.find(quote => quote.id === repairRequest.best_quote_id) ?? chooseBestQuote(quotes)
      : chooseBestQuote(quotes);
    const pendingApprovals = quotes.filter(quote => quote.approval_status === 'pending');
    const approvalSummary = quotes.reduce((summary, quote) => {
      const status = quote.approval_status === 'approved'
        ? 'approved'
        : quote.approval_status === 'rejected'
          ? 'rejected'
          : 'pending';
      summary[status] += 1;
      return summary;
    }, { pending: 0, approved: 0, rejected: 0 });

    return jsonResponse({
      status: 'success',
      session: {
        requestId: repairRequest.id,
        userId: repairRequest.user_id,
        urgency: repairRequest.urgency,
        status: repairRequest.status,
        issueDetails: {
          category: repairRequest.category,
          brand: repairRequest.brand,
          modelNumber: repairRequest.model_name,
          imageUrl: repairRequest.image_url,
          diagnosis: repairRequest.diagnosis,
          nextQuestion: repairRequest.next_question,
        },
        quotesReceived: quotes.length,
        quotes,
        bestQuote,
        pendingApprovals,
        approvalSummary,
        notifications: notificationData ?? [],
        messages: messageData ?? [],
        jobs: jobData ?? [],
        createdAt: repairRequest.created_at,
        updatedAt: repairRequest.updated_at,
      },
    });
  } catch (error) {
    return jsonResponse({
      status: 'error',
      message: error instanceof Error ? error.message : 'Status lookup failed',
    }, { status: 500 });
  }
}
