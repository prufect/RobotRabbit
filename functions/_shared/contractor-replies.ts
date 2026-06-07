import { parseContractorReply } from './analysis.ts';
import { chooseBestQuote } from './jobs.ts';
import type { Contractor, ContractorQuote, RepairRequest } from './types.ts';

type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export type RecordContractorReplyInput = {
  requestId: string;
  contractorId?: string | null;
  contractorName: string;
  contractorPhone?: string | null;
  messageBody: string;
  source?: 'direct' | 'telegram' | 'whatsapp';
  notificationId?: string | null;
  providerMessageId?: string | number | null;
  approvalStatus?: ApprovalStatus;
};

export type ContractorReplyResult = {
  repairRequest: RepairRequest;
  quote: ContractorQuote & Record<string, unknown>;
  quotes: Array<ContractorQuote & Record<string, unknown>>;
  quotesReceived: number;
  quotesNeeded: number;
  readyForUser: boolean;
  bestQuote: (ContractorQuote & Record<string, unknown>) | null;
  action: 'quote_recorded' | 'negotiation_complete';
};

type DatabaseClient = {
  database: {
    from: (table: string) => any;
  };
};

async function findContractor(
  client: DatabaseClient,
  input: Pick<RecordContractorReplyInput, 'contractorId' | 'contractorPhone'>,
): Promise<Contractor | null> {
  if (input.contractorId) {
    const { data } = await client.database
      .from('contractors')
      .select('*')
      .eq('id', input.contractorId)
      .maybeSingle();
    if (data) return data as Contractor;
  }

  if (input.contractorPhone) {
    const { data } = await client.database
      .from('contractors')
      .select('*')
      .eq('phone', input.contractorPhone)
      .maybeSingle();
    if (data) return data as Contractor;
  }

  return null;
}

async function createContractor(
  client: DatabaseClient,
  input: RecordContractorReplyInput,
  repairRequest: RepairRequest,
): Promise<Contractor | null> {
  const { data: insertedContractors } = await client.database
    .from('contractors')
    .insert([{
      name: input.contractorName,
      phone: input.contractorPhone ?? null,
      website: null,
      category: repairRequest.category ?? 'home repair',
      location_text: repairRequest.location_text,
      source: input.source ?? 'direct',
      source_ref: input.contractorPhone ?? input.contractorId ?? null,
      metadata: {},
    }])
    .select();

  return Array.isArray(insertedContractors) ? insertedContractors[0] as Contractor : null;
}

async function findExistingQuote(
  client: DatabaseClient,
  repairRequest: RepairRequest,
  contractor: Contractor | null,
  input: RecordContractorReplyInput,
): Promise<(ContractorQuote & Record<string, unknown>) | null> {
  if (contractor?.id) {
    const { data } = await client.database
      .from('contractor_quotes')
      .select('*')
      .eq('request_id', repairRequest.id)
      .eq('contractor_id', contractor.id)
      .maybeSingle();
    if (data) return data as ContractorQuote & Record<string, unknown>;
  }

  if (input.contractorPhone) {
    const { data } = await client.database
      .from('contractor_quotes')
      .select('*')
      .eq('request_id', repairRequest.id)
      .eq('contractor_phone', input.contractorPhone)
      .maybeSingle();
    if (data) return data as ContractorQuote & Record<string, unknown>;
  }

  return null;
}

export async function recordContractorReply(
  client: DatabaseClient,
  input: RecordContractorReplyInput,
): Promise<ContractorReplyResult> {
  const { data: request, error: requestError } = await client.database
    .from('repair_requests')
    .select('*')
    .eq('id', input.requestId)
    .single();

  if (requestError || !request) {
    throw new Error('Repair request not found');
  }

  const repairRequest = request as RepairRequest;
  const contractor = await findContractor(client, input)
    ?? await createContractor(client, input, repairRequest);
  const parsed = parseContractorReply(input.messageBody);
  const receivedAt = new Date().toISOString();
  const approvalStatus = input.approvalStatus ?? 'pending';
  const quoteValues = {
    request_id: repairRequest.id,
    user_id: repairRequest.user_id,
    contractor_id: contractor?.id ?? input.contractorId ?? null,
    contractor_name: contractor?.name ?? input.contractorName,
    contractor_phone: contractor?.phone ?? input.contractorPhone ?? null,
    available: parsed.available,
    price: parsed.price,
    availability: parsed.availability,
    raw_message: input.messageBody,
    approval_status: approvalStatus,
    approved_at: null,
    rejected_at: null,
    approval_metadata: {
      source: input.source ?? 'direct',
      notificationId: input.notificationId ?? null,
      providerMessageId: input.providerMessageId != null ? String(input.providerMessageId) : null,
      receivedAt,
    },
  };

  const existingQuote = await findExistingQuote(client, repairRequest, contractor, input);
  const { data: savedQuoteData } = existingQuote?.id
    ? await client.database
      .from('contractor_quotes')
      .update(quoteValues)
      .eq('id', existingQuote.id)
      .select()
    : await client.database
      .from('contractor_quotes')
      .insert([quoteValues])
      .select();
  const quote = Array.isArray(savedQuoteData) && savedQuoteData[0]
    ? savedQuoteData[0] as ContractorQuote & Record<string, unknown>
    : { ...existingQuote, ...quoteValues } as ContractorQuote & Record<string, unknown>;

  const { data: quoteData } = await client.database
    .from('contractor_quotes')
    .select('*')
    .eq('request_id', repairRequest.id);
  const quotes = Array.isArray(quoteData) ? quoteData as Array<ContractorQuote & Record<string, unknown>> : [quote];
  const quotesNeeded = Number(Deno.env.get('MIN_QUOTES_REQUIRED') ?? 3);
  const readyForUser = quotes.length >= quotesNeeded;
  const bestQuote = readyForUser ? chooseBestQuote(quotes) : null;

  await client.database
    .from('repair_requests')
    .update({
      status: readyForUser ? 'pending_approval' : 'negotiating',
      best_quote_id: bestQuote?.id ?? repairRequest.best_quote_id ?? null,
    })
    .eq('id', repairRequest.id);

  await client.database.from('request_messages').insert([{
    request_id: repairRequest.id,
    user_id: repairRequest.user_id,
    role: 'assistant',
    message_type: readyForUser ? 'quote' : 'notification',
    content: readyForUser
      ? `Received ${quotes.length} quotes. The best offer is ready for homeowner approval.`
      : `Recorded contractor reply ${quotes.length} of ${quotesNeeded}.`,
    metadata: {
      contractorId: contractor?.id ?? input.contractorId ?? null,
      contractorPhone: contractor?.phone ?? input.contractorPhone ?? null,
      quoteId: quote.id,
      approvalStatus,
      source: input.source ?? 'direct',
      bestQuote,
    },
  }]);

  // --- Update conversation with this reply ---
  const contractorId = contractor?.id ?? input.contractorId ?? null;
  if (contractorId) {
    const { data: convRows } = await client.database
      .from('conversations')
      .select('id, unread_count')
      .eq('user_id', repairRequest.user_id)
      .eq('contractor_id', contractorId)
      .limit(1);

    if (convRows && convRows.length > 0) {
      const conversationId = convRows[0].id;
      const replyPreview = input.messageBody.slice(0, 120);

      await client.database
        .from('conversations')
        .update({
          latest_request_id: repairRequest.id,
          last_message_at: receivedAt,
          last_message_preview: replyPreview,
          unread_count: (convRows[0] as any).unread_count ? (convRows[0] as any).unread_count + 1 : 1,
          negotiation_status: readyForUser ? 'pending_approval' : 'active',
        })
        .eq('id', conversationId);

      await client.database.from('conversation_messages').insert([{
        conversation_id: conversationId,
        request_id: repairRequest.id,
        direction: 'inbound',
        channel: input.source ?? 'direct',
        kind: 'reply',
        body: input.messageBody,
        metadata: {
          quoteId: quote.id,
          price: parsed.price,
          availability: parsed.availability,
          approvalStatus,
        },
      }]);
    }
  }

  return {
    repairRequest,
    quote,
    quotes,
    quotesReceived: quotes.length,
    quotesNeeded,
    readyForUser,
    bestQuote,
    action: readyForUser ? 'negotiation_complete' : 'quote_recorded',
  };
}
