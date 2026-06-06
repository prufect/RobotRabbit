import { createAdminClient } from 'npm:@insforge/sdk';
import { parseContractorReply } from './_shared/analysis.ts';
import { chooseBestQuote } from './_shared/jobs.ts';
import {
  adminApiKey,
  edgeBaseUrl,
  isInternalRequest,
  jsonResponse,
  parseJsonBody,
  requirePost,
} from './_shared/http.ts';
import type { Contractor, ContractorQuote, RepairRequest } from './_shared/types.ts';

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

    const { data: request, error: requestError } = await client.database
      .from('repair_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (requestError || !request) {
      return jsonResponse({ error: 'Repair request not found' }, { status: 404 });
    }

    const repairRequest = request as RepairRequest;
    let contractor: Contractor | null = null;
    if (contractorPhone) {
      const { data: existingContractor } = await client.database
        .from('contractors')
        .select('*')
        .eq('phone', contractorPhone)
        .maybeSingle();
      contractor = existingContractor as Contractor | null;
    }

    if (!contractor) {
      const { data: insertedContractors } = await client.database
        .from('contractors')
        .insert([{
          name: body.contractorName,
          phone: contractorPhone,
          website: null,
          category: repairRequest.category ?? 'home repair',
          location_text: repairRequest.location_text,
          source: 'manual',
          source_ref: contractorPhone,
          metadata: {},
        }])
        .select();
      contractor = Array.isArray(insertedContractors) ? insertedContractors[0] as Contractor : null;
    }

    const parsed = parseContractorReply(body.messageBody);
    const quoteValues = {
      request_id: repairRequest.id,
      user_id: repairRequest.user_id,
      contractor_id: contractor?.id ?? null,
      contractor_name: body.contractorName,
      contractor_phone: contractorPhone,
      available: parsed.available,
      price: parsed.price,
      availability: parsed.availability,
      raw_message: body.messageBody,
    };

    const { data: existingQuote } = contractorPhone
      ? await client.database
        .from('contractor_quotes')
        .select('*')
        .eq('request_id', repairRequest.id)
        .eq('contractor_phone', contractorPhone)
        .maybeSingle()
      : { data: null };

    if (existingQuote?.id) {
      await client.database
        .from('contractor_quotes')
        .update(quoteValues)
        .eq('id', existingQuote.id);
    } else {
      await client.database.from('contractor_quotes').insert([quoteValues]);
    }

    const { data: quoteData } = await client.database
      .from('contractor_quotes')
      .select('*')
      .eq('request_id', repairRequest.id);
    const quotes = Array.isArray(quoteData) ? quoteData as Array<ContractorQuote & Record<string, unknown>> : [];
    const quotesNeeded = Number(Deno.env.get('MIN_QUOTES_REQUIRED') ?? 3);
    const readyForUser = quotes.length >= quotesNeeded;
    const bestQuote = readyForUser ? chooseBestQuote(quotes) : null;

    if (readyForUser) {
      await client.database
        .from('repair_requests')
        .update({
          status: 'completed',
          best_quote_id: bestQuote?.id ?? null,
        })
        .eq('id', repairRequest.id);
    }

    await client.database.from('request_messages').insert([{
      request_id: repairRequest.id,
      user_id: repairRequest.user_id,
      role: 'assistant',
      message_type: readyForUser ? 'quote' : 'notification',
      content: readyForUser
        ? `Received ${quotes.length} quotes and selected the best available option.`
        : `Recorded quote ${quotes.length} of ${quotesNeeded}.`,
      metadata: { contractorPhone, bestQuote },
    }]);

    return jsonResponse({
      status: 'success',
      action: readyForUser ? 'negotiation_complete' : 'quote_recorded',
      quotesReceived: quotes.length,
      quotesNeeded,
      readyForUser,
      bestQuote,
      allQuotes: quotes,
      messageToUser: readyForUser
        ? `Great news. I compared ${quotes.length} quotes and found the best available option.`
        : undefined,
    });
  } catch (error) {
    return jsonResponse({
      status: 'error',
      message: error instanceof Error ? error.message : 'Contractor reply handling failed',
    }, { status: 500 });
  }
}
