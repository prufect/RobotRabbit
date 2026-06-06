import { createClient } from 'npm:@insforge/sdk';
import { analyzeRepairImage } from './_shared/analysis.ts';
import { edgeBaseUrl, getBearerToken, jsonResponse, parseJsonBody, requirePost } from './_shared/http.ts';
import type { RepairRequest } from './_shared/types.ts';

type AnalyzeBody = {
  requestId?: unknown;
  userContext?: unknown;
};

export default async function analyze(req: Request): Promise<Response> {
  const methodResponse = requirePost(req);
  if (methodResponse) return methodResponse;

  try {
    const body = await parseJsonBody<AnalyzeBody>(req);
    if (typeof body.requestId !== 'string' || !body.requestId) {
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
      .eq('id', body.requestId)
      .single();

    if (requestError || !request) {
      return jsonResponse({ error: 'Repair request not found' }, { status: 404 });
    }

    const repairRequest = request as RepairRequest;
    if (repairRequest.user_id !== user.id) {
      return jsonResponse({ error: 'Forbidden' }, { status: 403 });
    }

    await client.database.from('request_messages').insert([{
      request_id: repairRequest.id,
      user_id: user.id,
      role: 'system',
      message_type: 'analysis',
      content: 'Image analysis started.',
      metadata: {},
    }]);

    const userContext = typeof body.userContext === 'string' ? body.userContext : undefined;

    const analysis = await analyzeRepairImage(repairRequest.image_url, {
      geminiApiKey: Deno.env.get('GEMINI_API_KEY'),
      geminiModel: Deno.env.get('GEMINI_MODEL'),
      apiKey: Deno.env.get('OPENROUTER_API_KEY'),
      model: Deno.env.get('OPENROUTER_MODEL'),
      userContext,
    });

    await client.database
      .from('repair_requests')
      .update({
        status: analysis.status,
        category: analysis.category,
        brand: analysis.brand,
        model_name: analysis.modelNumber,
        diagnosis: analysis.diagnosis,
        next_question: analysis.nextQuestion,
      })
      .eq('id', repairRequest.id);

    await client.database.from('request_messages').insert([{
      request_id: repairRequest.id,
      user_id: user.id,
      role: 'assistant',
      message_type: 'analysis',
      content: analysis.messageToUser,
      metadata: {
        isIdentified: analysis.isIdentified,
        category: analysis.category,
        brand: analysis.brand,
        modelNumber: analysis.modelNumber,
      },
    }]);

    if (analysis.isIdentified) {
      await client.database.from('agent_jobs').insert([{
        request_id: repairRequest.id,
        user_id: user.id,
        job_type: 'search_contractors',
        status: 'pending',
        payload: {
          contractorSearchQuery: analysis.contractorSearchQuery,
        },
      }]);
    }

    return jsonResponse({
      status: 'success',
      isIdentified: analysis.isIdentified,
      confidenceScore: analysis.confidenceScore,
      category: analysis.category,
      brand: analysis.brand,
      modelNumber: analysis.modelNumber,
      messageToUser: analysis.messageToUser,
      contractorSearchQuery: analysis.contractorSearchQuery,
      clarifyingQuestion: analysis.clarifyingQuestion,
    });
  } catch (error) {
    return jsonResponse({
      status: 'error',
      message: error instanceof Error ? error.message : 'Analyze failed',
    }, { status: 500 });
  }
}
