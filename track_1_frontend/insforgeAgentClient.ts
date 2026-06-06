import { createClient } from '@insforge/sdk';

type AgentRabbitClientOptions = {
  baseUrl: string;
  anonKey: string;
};

type StartRepairAnalysisInput = {
  file: File;
  urgency?: 'low' | 'normal' | 'medium' | 'high' | 'emergency';
  locationText?: string;
};

function extensionFrom(file: File): string {
  const fromName = file.name.split('.').pop();
  if (fromName && fromName !== file.name) return fromName.toLowerCase();
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

export function createAgentRabbitClient({ baseUrl, anonKey }: AgentRabbitClientOptions) {
  const insforge = createClient({ baseUrl, anonKey });

  return {
    insforge,

    async startRepairAnalysis(input: StartRepairAnalysisInput) {
      const { data: userData, error: userError } = await insforge.auth.getCurrentUser();
      if (userError) throw userError;
      const user = userData?.user;
      if (!user?.id) throw new Error('User must be signed in before starting a repair request.');

      const requestId = crypto.randomUUID();
      const upload = await insforge.storage
        .from('repair-photos')
        .upload(`users/${user.id}/requests/${requestId}/photo.${extensionFrom(input.file)}`, input.file);

      if (upload.error) throw upload.error;
      if (!upload.data) throw new Error('Photo upload did not return storage metadata.');

      const { data: requests, error: insertError } = await insforge.database
        .from('repair_requests')
        .insert([{
          id: requestId,
          user_id: user.id,
          status: 'uploaded',
          urgency: input.urgency ?? 'normal',
          location_text: input.locationText ?? null,
          image_url: upload.data.url,
          image_key: upload.data.key,
        }])
        .select();

      if (insertError) throw insertError;

      const analysis = await insforge.functions.invoke('analyze', {
        body: { requestId },
      });

      if (analysis.error) throw analysis.error;

      return {
        request: requests?.[0] ?? null,
        analysis: analysis.data,
      };
    },

    async getRepairStatus(requestId: string) {
      return insforge.functions.invoke('status', {
        body: { requestId },
      });
    },

    async processAgentJobs(limit = 3) {
      return insforge.functions.invoke('process-agent-jobs', {
        body: { limit },
      });
    },
  };
}
