import { createAdminClient, createClient } from 'npm:@insforge/sdk';
import { getNextRunAfter, shouldRetryJob } from './_shared/jobs.ts';
import {
  adminApiKey,
  edgeBaseUrl,
  getBearerToken,
  isInternalRequest,
  jsonResponse,
  parseJsonBody,
  requirePost,
} from './_shared/http.ts';
import type { AgentJob } from './_shared/types.ts';

type ProcessJobsBody = {
  limit?: unknown;
};

function slugForJob(job: AgentJob): string {
  if (job.job_type === 'search_contractors') return 'search-contractors';
  if (job.job_type === 'notify_contractors') return 'notify-contractors';
  return 'analyze';
}

export default async function processAgentJobs(req: Request): Promise<Response> {
  const methodResponse = requirePost(req);
  if (methodResponse) return methodResponse;

  try {
    const internal = isInternalRequest(req);
    const client = internal
      ? createAdminClient({ baseUrl: edgeBaseUrl(), apiKey: adminApiKey() })
      : createClient({ baseUrl: edgeBaseUrl(), edgeFunctionToken: getBearerToken(req) });

    if (!internal) {
      const { data: userData } = await client.auth.getCurrentUser();
      if (!userData?.user?.id) return jsonResponse({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await parseJsonBody<ProcessJobsBody>(req);
    const limit = typeof body.limit === 'number' && body.limit > 0 ? Math.min(body.limit, 10) : 3;

    const { data: jobData } = await client.database
      .from('agent_jobs')
      .select('*')
      .eq('status', 'pending')
      .lte('run_after', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(limit);
    const jobs = Array.isArray(jobData) ? jobData as AgentJob[] : [];
    const processed: Array<{ id: string; status: string; error?: string }> = [];

    for (const job of jobs) {
      await client.database
        .from('agent_jobs')
        .update({
          status: 'running',
          attempt_count: job.attempt_count + 1,
          locked_at: new Date().toISOString(),
          last_error: null,
        })
        .eq('id', job.id);

      try {
        const secret = Deno.env.get('AGENT_INTERNAL_SECRET');
        if (!secret) throw new Error('AGENT_INTERNAL_SECRET is required to dispatch jobs');

        const payload = {
          ...(job.payload ?? {}),
          requestId: job.request_id,
        };
        const response = await fetch(`${edgeBaseUrl()}/functions/${slugForJob(job)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Agent-Internal-Secret': secret,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`${slugForJob(job)} returned ${response.status}: ${await response.text()}`);
        }

        await client.database
          .from('agent_jobs')
          .update({
            status: 'succeeded',
            locked_at: null,
            last_error: null,
          })
          .eq('id', job.id);
        processed.push({ id: job.id, status: 'succeeded' });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Job failed';
        const retry = shouldRetryJob({ attempt_count: job.attempt_count + 1 });

        await client.database
          .from('agent_jobs')
          .update({
            status: retry ? 'pending' : 'failed',
            locked_at: null,
            last_error: errorMessage,
            run_after: retry ? getNextRunAfter(job.attempt_count + 1).toISOString() : new Date().toISOString(),
          })
          .eq('id', job.id);
        processed.push({ id: job.id, status: retry ? 'pending' : 'failed', error: errorMessage });
      }
    }

    return jsonResponse({ status: 'success', processed });
  } catch (error) {
    return jsonResponse({
      status: 'error',
      message: error instanceof Error ? error.message : 'Job processing failed',
    }, { status: 500 });
  }
}
