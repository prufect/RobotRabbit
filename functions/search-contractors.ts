import { createAdminClient, createClient } from 'npm:@insforge/sdk';
import { searchContractors } from './_shared/search.ts';
import {
  adminApiKey,
  edgeBaseUrl,
  getBearerToken,
  isInternalRequest,
  jsonResponse,
  parseJsonBody,
  requirePost,
} from './_shared/http.ts';
import type { RepairRequest } from './_shared/types.ts';

type SearchBody = {
  requestId?: unknown;
};

export default async function searchContractorsFunction(req: Request): Promise<Response> {
  const methodResponse = requirePost(req);
  if (methodResponse) return methodResponse;

  try {
    const internal = isInternalRequest(req);
    const client = internal
      ? createAdminClient({ baseUrl: edgeBaseUrl(), apiKey: adminApiKey() })
      : createClient({ baseUrl: edgeBaseUrl(), edgeFunctionToken: getBearerToken(req) });

    const body = await parseJsonBody<SearchBody>(req);
    if (typeof body.requestId !== 'string' || !body.requestId) {
      return jsonResponse({ error: 'requestId is required' }, { status: 400 });
    }

    let userId: string | null = null;
    if (!internal) {
      const { data: userData } = await client.auth.getCurrentUser();
      userId = userData?.user?.id ?? null;
      if (!userId) return jsonResponse({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: request, error: requestError } = await client.database
      .from('repair_requests')
      .select('*')
      .eq('id', body.requestId)
      .single();

    if (requestError || !request) {
      return jsonResponse({ error: 'Repair request not found' }, { status: 404 });
    }

    const repairRequest = request as RepairRequest;
    if (userId && repairRequest.user_id !== userId) {
      return jsonResponse({ error: 'Forbidden' }, { status: 403 });
    }

    await client.database
      .from('repair_requests')
      .update({ status: 'searching' })
      .eq('id', repairRequest.id);

    const contractorRows = await searchContractors(repairRequest, Deno.env.get('SERPAPI_KEY'));
    const { data: insertedContractors, error: insertError } = await client.database
      .from('contractors')
      .insert(contractorRows)
      .select();

    if (insertError) {
      throw new Error(`Failed to insert contractor results: ${insertError.message ?? insertError}`);
    }

    const contractors = Array.isArray(insertedContractors) ? insertedContractors : [];
    const contractorIds = contractors
      .map(contractor => contractor.id)
      .filter((id): id is string => typeof id === 'string');

    await client.database.from('request_messages').insert([{
      request_id: repairRequest.id,
      user_id: repairRequest.user_id,
      role: 'assistant',
      message_type: 'search',
      content: `Found ${contractors.length} contractors for this repair.`,
      metadata: { contractorIds },
    }]);

    await client.database.from('agent_jobs').insert([{
      request_id: repairRequest.id,
      user_id: repairRequest.user_id,
      job_type: 'notify_contractors',
      status: 'pending',
      payload: { contractorIds },
    }]);

    return jsonResponse({
      status: 'success',
      results: contractors,
      contractorIds,
    });
  } catch (error) {
    return jsonResponse({
      status: 'error',
      message: error instanceof Error ? error.message : 'Contractor search failed',
    }, { status: 500 });
  }
}
