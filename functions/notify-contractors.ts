import { createAdminClient, createClient } from 'npm:@insforge/sdk';
import {
  buildContractorMessage,
  createMockNotification,
  createTelegramNotification,
  sendTelegramNotification,
  sendWhatsAppNotification,
} from './_shared/notifications.ts';
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
  contractorId?: unknown;
  contractorIds?: unknown;
  selectedContractor?: unknown;
};

type NotifiableContractor = {
  id: string | null;
  name: string;
  phone: string | null;
};

function selectedContractorIds(body: NotifyBody): string[] {
  const rawIds = typeof body.contractorId === 'string'
    ? [body.contractorId]
    : Array.isArray(body.contractorIds)
      ? body.contractorIds
      : [];

  return [...new Set(rawIds.filter((id): id is string => typeof id === 'string' && id.length > 0))];
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function selectedContractorFromBody(value: unknown, selectedContractorId: string): NotifiableContractor | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : null;
  if (id && id !== selectedContractorId) return null;

  const name = typeof record.name === 'string' && record.name.trim()
    ? record.name.trim()
    : null;
  if (!name) return null;

  return {
    id: null,
    name,
    phone: typeof record.phone === 'string' && record.phone.trim() ? record.phone.trim() : null,
  };
}

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
    const contractorIds = selectedContractorIds(body);
    if (contractorIds.length !== 1) {
      return jsonResponse({ error: 'Select exactly one contractor to notify' }, { status: 400 });
    }
    const selectedContractorId = contractorIds[0];

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

    let contractorFromDatabase: NotifiableContractor | null = null;
    if (isUuid(selectedContractorId)) {
      const { data: contractorData } = await client.database
        .from('contractors')
        .select('*')
        .in('id', contractorIds);
      const databaseContractors = Array.isArray(contractorData) ? contractorData as Contractor[] : [];
      contractorFromDatabase = databaseContractors[0]
        ? {
          id: databaseContractors[0].id,
          name: databaseContractors[0].name,
          phone: databaseContractors[0].phone,
        }
        : null;
    }

    const selectedContractor = contractorFromDatabase
      ?? selectedContractorFromBody(body.selectedContractor, selectedContractorId);
    if (!selectedContractor) {
      return jsonResponse({ error: 'Selected contractor not found' }, { status: 404 });
    }

    const contractors: NotifiableContractor[] = [selectedContractor];
    const message = buildContractorMessage(repairRequest);

    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioFrom = Deno.env.get('TWILIO_WHATSAPP_FROM');
    const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const telegramChatId = Deno.env.get('TELEGRAM_CHAT_ID') ?? Deno.env.get('TELEGRAM_DEMO_CHAT_ID');

    const notifications: NotificationInsert[] = [];
    const errors: string[] = [];

    for (const contractor of contractors) {
      if (telegramBotToken && telegramChatId) {
        try {
          const telegramMessage = `[Demo contractor: ${contractor.name}]\n${message}`;
          const messageId = await sendTelegramNotification({
            botToken: telegramBotToken,
            chatId: telegramChatId,
            message: telegramMessage,
          });
          notifications.push(createTelegramNotification({
            requestId: repairRequest.id,
            userId: repairRequest.user_id,
            contractorId: contractor.id,
            contractorName: contractor.name,
            telegramChatId,
            message,
            providerMessageId: messageId,
          }));
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
            message: `[Demo contractor: ${contractor.name}]\n${message}`,
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

    // --- Upsert conversations and insert conversation messages ---
    for (const contractor of contractors) {
      const matchingNotification = notifications.find(n => n.contractor_id === contractor.id);
      if (!matchingNotification) continue;

      // Check if conversation already exists for this user + contractor
      const { data: existingConvs } = await client.database
        .from('conversations')
        .select('id')
        .eq('user_id', repairRequest.user_id)
        .eq('contractor_id', contractor.id)
        .limit(1);

      let conversationId: string;
      const messagePreview = (matchingNotification.message ?? '').slice(0, 120);
      const now = new Date().toISOString();

      if (existingConvs && existingConvs.length > 0) {
        conversationId = existingConvs[0].id;
        await client.database
          .from('conversations')
          .update({
            latest_request_id: repairRequest.id,
            last_message_at: now,
            last_message_preview: messagePreview,
            status: 'active',
          })
          .eq('id', conversationId);
      } else {
        const { data: newConvs } = await client.database
          .from('conversations')
          .insert([{
            user_id: repairRequest.user_id,
            contractor_id: contractor.id,
            contractor_name: contractor.name,
            contractor_phone: contractor.phone ?? null,
            latest_request_id: repairRequest.id,
            status: 'active',
            last_message_at: now,
            last_message_preview: messagePreview,
            unread_count: 0,
          }])
          .select();
        conversationId = newConvs?.[0]?.id;
      }

      if (conversationId) {
        await client.database.from('conversation_messages').insert([{
          conversation_id: conversationId,
          request_id: repairRequest.id,
          direction: 'outbound',
          channel: matchingNotification.channel ?? 'insforge',
          kind: 'outreach',
          body: matchingNotification.message ?? '',
          metadata: { contractorId: contractor.id, notificationId: matchingNotification.provider_message_id ?? null },
        }]);
      }
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
      content: `Contacted ${selectedContractor.name}. Waiting for a quote.`,
      metadata: {
        contractorId: selectedContractorId,
        contractorIds,
        selectedContractor: {
          id: selectedContractor.id ?? selectedContractorId,
          name: selectedContractor.name,
        },
        errors,
      },
    }]);

    return jsonResponse({
      status: 'success',
      notifiedCount: notifications.length,
      selectedContractorId,
      errors,
    });
  } catch (error) {
    return jsonResponse({
      status: 'error',
      message: error instanceof Error ? error.message : 'Contractor notification failed',
    }, { status: 500 });
  }
}
