import { createAdminClient, createClient } from 'npm:@insforge/sdk';
import { buildContractorMessage, createMockNotification, sendWhatsAppNotification, sendTelegramNotification } from './_shared/notifications.ts';
import {
  adminApiKey,
  edgeBaseUrl,
  getBearerToken,
  isInternalRequest,
  jsonResponse,
  parseJsonBody,
  requirePost,
} from './_shared/http.ts';
import type { Contractor, NotificationInsert, RepairRequest } from './_shared/types.ts';

type NotifyBody = {
  requestId?: unknown;
  contractorIds?: unknown;
};

export default async function notifyContractors(req: Request): Promise<Response> {
  const methodResponse = requirePost(req);
  if (methodResponse) return methodResponse;

  try {
    const internal = isInternalRequest(req);
    const client = internal
      ? createAdminClient({ baseUrl: edgeBaseUrl(), apiKey: adminApiKey() })
      : createClient({ baseUrl: edgeBaseUrl(), edgeFunctionToken: getBearerToken(req) });

    const body = await parseJsonBody<NotifyBody>(req);
    if (typeof body.requestId !== 'string' || !body.requestId) {
      return jsonResponse({ error: 'requestId is required' }, { status: 400 });
    }
    if (!Array.isArray(body.contractorIds)) {
      return jsonResponse({ error: 'contractorIds must be an array' }, { status: 400 });
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

    const contractorIds = body.contractorIds.filter((id): id is string => typeof id === 'string');
    const { data: contractorData } = await client.database
      .from('contractors')
      .select('*')
      .in('id', contractorIds);
    const contractors = Array.isArray(contractorData) ? contractorData as Contractor[] : [];
    const message = buildContractorMessage(repairRequest);

    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioFrom = Deno.env.get('TWILIO_WHATSAPP_FROM');
    
    const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const telegramChatId = Deno.env.get('TELEGRAM_CHAT_ID') || Deno.env.get('TELEGRAM_TEST_CHAT_ID');

    const notifications: NotificationInsert[] = [];
    const errors: string[] = [];

    for (const contractor of contractors) {
      if (contractor.id === 'test-contractor' && telegramBotToken && telegramChatId) {
        try {
          const messageId = await sendTelegramNotification({
            botToken: telegramBotToken,
            chatId: telegramChatId,
            message,
          });
          notifications.push({
            request_id: repairRequest.id,
            user_id: repairRequest.user_id,
            contractor_id: contractor.id,
            channel: 'telegram',
            destination: telegramChatId,
            status: 'sent',
            message,
            provider_message_id: messageId,
            last_error: null,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Telegram send failed';
          errors.push(`${contractor.name}: ${errorMessage}`);
          notifications.push({
            request_id: repairRequest.id,
            user_id: repairRequest.user_id,
            contractor_id: contractor.id,
            channel: 'telegram',
            destination: telegramChatId,
            status: 'failed',
            message,
            provider_message_id: null,
            last_error: errorMessage,
          });
        }
      } else if (twilioAccountSid && twilioAuthToken && twilioFrom && contractor.phone) {
        try {
          const sid = await sendWhatsAppNotification({
            accountSid: twilioAccountSid,
            authToken: twilioAuthToken,
            from: twilioFrom,
            to: contractor.phone,
            message,
          });
          notifications.push({
            request_id: repairRequest.id,
            user_id: repairRequest.user_id,
            contractor_id: contractor.id,
            channel: 'whatsapp',
            destination: contractor.phone,
            status: 'sent',
            message,
            provider_message_id: sid,
            last_error: null,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Twilio send failed';
          errors.push(`${contractor.name}: ${errorMessage}`);
          notifications.push({
            request_id: repairRequest.id,
            user_id: repairRequest.user_id,
            contractor_id: contractor.id,
            channel: 'whatsapp',
            destination: contractor.phone,
            status: 'failed',
            message,
            provider_message_id: null,
            last_error: errorMessage,
          });
        }
      } else {
        notifications.push(createMockNotification({
          requestId: repairRequest.id,
          userId: repairRequest.user_id,
          contractorId: contractor.id,
          destination: contractor.phone,
          message,
        }));
      }
    }

    if (notifications.length > 0) {
      await client.database.from('contractor_notifications').insert(notifications);
    }

    await client.database
      .from('repair_requests')
      .update({ status: 'negotiating' })
      .eq('id', repairRequest.id);

    await client.database.from('request_messages').insert([{
      request_id: repairRequest.id,
      user_id: repairRequest.user_id,
      role: 'assistant',
      message_type: 'notification',
      content: `Contacted ${notifications.length} contractors. Waiting for quotes.`,
      metadata: { contractorIds, errors },
    }]);

    return jsonResponse({
      status: 'success',
      notifiedCount: notifications.length,
      errors,
    });
  } catch (error) {
    return jsonResponse({
      status: 'error',
      message: error instanceof Error ? error.message : 'Contractor notification failed',
    }, { status: 500 });
  }
}
