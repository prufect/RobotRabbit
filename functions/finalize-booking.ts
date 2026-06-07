import { createAdminClient, createClient } from 'npm:@insforge/sdk';
import { adminApiKey, edgeBaseUrl, getBearerToken, isInternalRequest, jsonResponse, parseJsonBody, requirePost } from './_shared/http.ts';
import { sendTelegramNotification } from './_shared/notifications.ts';

type FinalizeBookingBody = {
  requestId: string;
  contractorId: string;
  quoteId?: string;
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

    const { data: quoteData } = await client.database
      .from('contractor_quotes')
      .select('*')
      .eq('request_id', body.requestId);
    const quotes = Array.isArray(quoteData) ? quoteData : [];
    const selectedQuote = quotes.find((quote) => (
      quote.id === body.quoteId
      || quote.contractor_id === body.contractorId
      || quote.contractor_phone === body.contractorId
    ));
    const now = new Date().toISOString();

    if (selectedQuote?.id) {
      await client.database
        .from('contractor_quotes')
        .update({
          approval_status: 'approved',
          approved_at: now,
          rejected_at: null,
        })
        .eq('id', selectedQuote.id);

      const rejectedQuoteIds = quotes
        .filter((quote) => quote.id && quote.id !== selectedQuote.id && quote.approval_status === 'pending')
        .map((quote) => quote.id);

      if (rejectedQuoteIds.length > 0) {
        await client.database
          .from('contractor_quotes')
          .update({
            approval_status: 'rejected',
            rejected_at: now,
          })
          .in('id', rejectedQuoteIds);
      }
    }

    await client.database.from('request_messages').insert([{
      request_id: body.requestId,
      user_id: request.user_id,
      role: 'assistant',
      message_type: 'notification',
      content: `Your appointment is booked on ${body.date} at ${body.time}. Calendar invites have been sent.`,
      metadata: {
        contractorId: body.contractorId,
        quoteId: selectedQuote?.id ?? body.quoteId ?? null,
        approvalStatus: selectedQuote ? 'approved' : null,
        date: body.date,
        time: body.time,
      },
    }]);

    const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const { data: telegramNotifications } = await client.database
      .from('contractor_notifications')
      .select('*')
      .eq('request_id', body.requestId)
      .eq('contractor_id', body.contractorId)
      .eq('channel', 'telegram')
      .order('created_at', { ascending: false })
      .limit(1);
    const telegramChatId = Array.isArray(telegramNotifications) && telegramNotifications[0]?.destination
      ? telegramNotifications[0].destination
      : body.contractorId === 'test-contractor'
        ? Deno.env.get('TELEGRAM_CHAT_ID') || Deno.env.get('TELEGRAM_TEST_CHAT_ID')
        : null;

    if (telegramBotToken && telegramChatId) {
      await sendTelegramNotification({
        botToken: telegramBotToken,
        chatId: telegramChatId,
        message: `Booking Confirmed! The user has accepted your offer. Your appointment is scheduled for ${body.date} at ${body.time}.`,
      });
    }

    await client.database
      .from('repair_requests')
      .update({
        status: 'booked',
        best_quote_id: selectedQuote?.id ?? request.best_quote_id ?? null,
      })
      .eq('id', body.requestId);

    const bookingNumber = 'BK-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + crypto.randomUUID().slice(0,4).toUpperCase();

    const { data: convRows } = await client.database
      .from('conversations')
      .select('id')
      .eq('user_id', request.user_id)
      .eq('contractor_id', body.contractorId)
      .limit(1);
    const conversationId = convRows?.[0]?.id ?? null;

    const { data: bookingRows } = await client.database.from('bookings').insert([{
      booking_number: bookingNumber,
      user_id: request.user_id,
      request_id: body.requestId,
      conversation_id: conversationId,
      contractor_id: body.contractorId,
      quote_id: selectedQuote?.id ?? body.quoteId ?? null,
      contractor_name: selectedQuote?.contractor_name ?? body.contractorId,
      contractor_phone: selectedQuote?.contractor_phone ?? null,
      category: request.category ?? null,
      price: selectedQuote?.price ?? null,
      scheduled_date: body.date,
      scheduled_time: body.time,
      status: 'upcoming',
    }]).select();
    const bookingId = bookingRows?.[0]?.id ?? null;

    if (conversationId) {
      await client.database
        .from('conversations')
        .update({ negotiation_status: 'booked' })
        .eq('id', conversationId);

      await client.database.from('conversation_messages').insert([{
        conversation_id: conversationId,
        request_id: body.requestId,
        direction: 'outbound',
        channel: 'insforge',
        kind: 'booking',
        body: `Booking confirmed for ${body.date} at ${body.time}. Booking #${bookingNumber}`,
        metadata: { bookingId, bookingNumber, date: body.date, time: body.time, price: selectedQuote?.price ?? null },
      }]);
    }

    return jsonResponse({
      status: 'success',
      approvalStatus: selectedQuote ? 'approved' : null,
      quoteId: selectedQuote?.id ?? null,
      bookingId,
      bookingNumber,
    });
  } catch (error) {
    console.error('Finalize booking error:', error);
    return jsonResponse({ status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
