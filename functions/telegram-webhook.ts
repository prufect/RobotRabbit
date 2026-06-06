import { createAdminClient } from 'npm:@insforge/sdk';
import { adminApiKey, edgeBaseUrl, jsonResponse, parseJsonBody, requirePost } from './_shared/http.ts';

export default async function telegramWebhook(req: Request): Promise<Response> {
  const methodResponse = requirePost(req);
  if (methodResponse) return methodResponse;

  try {
    const update = await parseJsonBody<any>(req);
    
    // Check if it's a message
    if (!update.message || !update.message.text) {
      return jsonResponse({ status: 'ignored' });
    }

    const messageText = update.message.text;
    const chatId = update.message.chat.id.toString();

    const client = createAdminClient({ baseUrl: edgeBaseUrl(), apiKey: adminApiKey() });

    // Look for the most recent notification sent to this chat ID
    const { data: notifications, error: notifError } = await client.database
      .from('contractor_notifications')
      .select('request_id, user_id, contractor_id')
      .eq('channel', 'telegram')
      .eq('destination', chatId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (notifError || !notifications || notifications.length === 0) {
      return jsonResponse({ error: 'No matching request found for this chat' }, { status: 404 });
    }

    const notif = notifications[0];

    // Store the reply in request_messages
    await client.database.from('request_messages').insert([{
      request_id: notif.request_id,
      user_id: notif.user_id,
      role: 'user',
      message_type: 'quote',
      content: messageText,
      metadata: { contractorId: notif.contractor_id, telegramMessageId: update.message.message_id },
    }]);

    // Update request status if needed
    await client.database
      .from('repair_requests')
      .update({ status: 'negotiating' })
      .eq('id', notif.request_id);

    return jsonResponse({ status: 'success' });
  } catch (error) {
    console.error('Webhook error:', error);
    return jsonResponse({ status: 'error' }, { status: 500 });
  }
}
