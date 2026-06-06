import { createAdminClient, createClient } from 'npm:@insforge/sdk';
import { adminApiKey, edgeBaseUrl, getBearerToken, isInternalRequest, jsonResponse, parseJsonBody, requirePost } from './_shared/http.ts';
import { sendTelegramNotification } from './_shared/notifications.ts';

type FinalizeBookingBody = {
  requestId: string;
  contractorId: string;
  date: string;
  time: string;
};

export default async function finalizeBooking(req: Request): Promise<Response> {
  const methodResponse = requirePost(req);
  if (methodResponse) return methodResponse;

  try {
    const internal = isInternalRequest(req);
    const client = internal
      ? createAdminClient({ baseUrl: edgeBaseUrl(), apiKey: adminApiKey() })
      : createClient({ baseUrl: edgeBaseUrl(), edgeFunctionToken: getBearerToken(req) });

    const body = await parseJsonBody<FinalizeBookingBody>(req);
    
    if (!body.requestId || !body.contractorId || !body.date || !body.time) {
      return jsonResponse({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data: request, error: requestError } = await client.database
      .from('repair_requests')
      .select('*')
      .eq('id', body.requestId)
      .single();

    if (requestError || !request) {
      return jsonResponse({ error: 'Repair request not found' }, { status: 404 });
    }

    // Insert user notification
    await client.database.from('request_messages').insert([{
      request_id: body.requestId,
      user_id: request.user_id,
      role: 'assistant',
      message_type: 'notification',
      content: `Your appointment is booked on ${body.date} at ${body.time}. Calendar invites have been sent.`,
      metadata: { contractorId: body.contractorId, date: body.date, time: body.time },
    }]);

    // Send Telegram Notification to Contractor
    if (body.contractorId === 'test-contractor') {
      const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
      const telegramChatId = Deno.env.get('TELEGRAM_CHAT_ID') || Deno.env.get('TELEGRAM_TEST_CHAT_ID');
      
      if (telegramBotToken && telegramChatId) {
        await sendTelegramNotification({
          botToken: telegramBotToken,
          chatId: telegramChatId,
          message: `Booking Confirmed! The user has accepted your offer. Your appointment is scheduled for ${body.date} at ${body.time}. (Calendar Invite Mock)`,
        });
      }
    }

    // Update request status
    await client.database
      .from('repair_requests')
      .update({ status: 'booked' })
      .eq('id', body.requestId);

    return jsonResponse({ status: 'success' });
  } catch (error) {
    console.error('Finalize booking error:', error);
    return jsonResponse({ status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
