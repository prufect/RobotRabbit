import { createAdminClient } from 'npm:@insforge/sdk';
import { recordContractorReply } from './_shared/contractor-replies.ts';
import { adminApiKey, edgeBaseUrl, jsonResponse, parseJsonBody, requirePost } from './_shared/http.ts';

function contractorNameFromNotification(message: string | null | undefined): string | null {
  const match = message?.match(/^\[Demo contractor:\s*([^\]]+)\]/);
  return match?.[1]?.trim() || null;
}

export default async function telegramWebhook(req: Request): Promise<Response> {
  const methodResponse = requirePost(req);
  if (methodResponse) return methodResponse;

  try {
    const update = await parseJsonBody<any>(req);
    
    if (!update.message || !update.message.text) {
      return jsonResponse({ status: 'ignored' });
    }

    const messageText = update.message.text;
    const chatId = update.message.chat.id.toString();
    const telegramMessageId = update.message.message_id != null
      ? String(update.message.message_id)
      : null;

    const client = createAdminClient({ baseUrl: edgeBaseUrl(), apiKey: adminApiKey() });

    const { data: notifications, error: notifError } = await client.database
      .from('contractor_notifications')
      .select('id, request_id, user_id, contractor_id, message')
      .eq('channel', 'telegram')
      .eq('destination', chatId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (notifError || !notifications || notifications.length === 0) {
      return jsonResponse({ error: 'No matching request found for this chat' }, { status: 404 });
    }

    const notif = notifications[0];
    const { data: contractor } = notif.contractor_id
      ? await client.database
        .from('contractors')
        .select('*')
        .eq('id', notif.contractor_id)
        .maybeSingle()
      : { data: null };
    const now = new Date().toISOString();

    await client.database
      .from('contractor_notifications')
      .update({
        status: 'replied',
        reply_received_at: now,
        reply_message_id: telegramMessageId,
        reply_body: messageText,
      })
      .eq('id', notif.id);

    const result = await recordContractorReply(client, {
      requestId: notif.request_id,
      contractorId: notif.contractor_id,
      contractorName: contractor?.name
        ?? contractorNameFromNotification(notif.message)
        ?? update.message.from?.first_name
        ?? `Telegram chat ${chatId}`,
      contractorPhone: contractor?.phone ?? null,
      messageBody: messageText,
      source: 'telegram',
      notificationId: notif.id,
      providerMessageId: telegramMessageId,
      approvalStatus: 'pending',
    });

    return jsonResponse({
      status: 'success',
      action: result.action,
      quoteId: result.quote.id,
      quotesReceived: result.quotesReceived,
      quotesNeeded: result.quotesNeeded,
      readyForUser: result.readyForUser,
      approvalStatus: result.quote.approval_status ?? 'pending',
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return jsonResponse({ status: 'error' }, { status: 500 });
  }
}
