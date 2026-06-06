import { createAdminClient } from 'npm:@insforge/sdk';
import { recordContractorReply } from './_shared/contractor-replies.ts';
import {
  adminApiKey,
  edgeBaseUrl,
  isInternalRequest,
  jsonResponse,
  parseJsonBody,
  requirePost,
} from './_shared/http.ts';

type ContractorReplyBody = {
  requestId?: unknown;
  conversationId?: unknown;
  contractorPhone?: unknown;
  contractorName?: unknown;
  messageBody?: unknown;
};

export default async function contractorReply(req: Request): Promise<Response> {
  const methodResponse = requirePost(req);
  if (methodResponse) return methodResponse;

  const secretIsConfigured = Boolean(Deno.env.get('AGENT_INTERNAL_SECRET'));
  if (secretIsConfigured && !isInternalRequest(req)) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await parseJsonBody<ContractorReplyBody>(req);
    const requestId = typeof body.requestId === 'string'
      ? body.requestId
      : typeof body.conversationId === 'string'
        ? body.conversationId
        : null;

    if (!requestId) return jsonResponse({ error: 'requestId is required' }, { status: 400 });
    if (typeof body.contractorName !== 'string' || !body.contractorName) {
      return jsonResponse({ error: 'contractorName is required' }, { status: 400 });
    }
    if (typeof body.messageBody !== 'string' || !body.messageBody) {
      return jsonResponse({ error: 'messageBody is required' }, { status: 400 });
    }

    const contractorPhone = typeof body.contractorPhone === 'string' ? body.contractorPhone : null;
    const client = createAdminClient({ baseUrl: edgeBaseUrl(), apiKey: adminApiKey() });

    const result = await recordContractorReply(client, {
      requestId,
      contractorName: body.contractorName,
      contractorPhone,
      messageBody: body.messageBody,
      source: 'direct',
      approvalStatus: 'pending',
    });

    return jsonResponse({
      status: 'success',
      action: result.action,
      quotesReceived: result.quotesReceived,
      quotesNeeded: result.quotesNeeded,
      readyForUser: result.readyForUser,
      bestQuote: result.bestQuote,
      allQuotes: result.quotes,
      approvalStatus: result.quote.approval_status ?? 'pending',
      messageToUser: result.readyForUser
        ? `Great news. I compared ${result.quotesReceived} quotes and the best offer is ready for approval.`
        : undefined,
    });
  } catch (error) {
    return jsonResponse({
      status: 'error',
      message: error instanceof Error ? error.message : 'Contractor reply handling failed',
    }, { status: 500 });
  }
}
