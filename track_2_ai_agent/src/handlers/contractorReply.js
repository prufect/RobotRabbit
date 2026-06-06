/**
 * POST /api/contractor-reply — Webhook for incoming contractor quotes.
 *
 * Track 3 forwards contractor SMS / Telegram messages here.  The handler:
 *  1. Validates the payload.
 *  2. Uses Gemini to parse the natural-language message into a structured quote.
 *  3. Records the quote in the session state.
 *  4. When enough quotes are collected, selects the best one and responds.
 */

import config from '../config.js';
import { parseContractorReply } from '../services/gemini.js';
import * as state from '../services/stateManager.js';
import { validateContractorReplyRequest } from '../utils/validation.js';
import { ValidationError, StateError } from '../utils/errors.js';

/**
 * Express handler for POST /api/contractor-reply.
 */
export async function contractorReplyHandler(req, res, next) {
  try {
    // ── Validate ─────────────────────────────────────────────────────────────
    const { valid, errors } = validateContractorReplyRequest(req.body);
    if (!valid) {
      throw new ValidationError('Invalid contractor reply payload.', { errors });
    }

    const { conversationId, contractorPhone, contractorName, messageBody } = req.body;

    // ── Look up session ─────────────────────────────────────────────────────
    const session = state.getSession(conversationId);
    if (!session) {
      throw new StateError(`No active session found for conversationId "${conversationId}".`);
    }

    console.info(JSON.stringify({
      level: 'info',
      timestamp: new Date().toISOString(),
      requestId: req.id,
      message: 'Contractor reply received',
      conversationId,
      contractorName,
      contractorPhone,
    }));

    // ── Parse the natural-language reply via Gemini ──────────────────────────
    const parsed = await parseContractorReply(messageBody);

    const quote = {
      contractorName,
      contractorPhone,
      available: parsed.available,
      price: parsed.price,
      availability: parsed.availability,
      rawMessage: messageBody,
    };

    state.addQuote(conversationId, quote);

    // ── Check if we have enough quotes ──────────────────────────────────────
    const updatedSession = state.getSession(conversationId);
    const quotesReceived = updatedSession.quotes.length;
    const quotesNeeded = config.MIN_QUOTES_REQUIRED;
    const readyForUser = quotesReceived >= quotesNeeded;

    if (readyForUser) {
      // Select the best quote and finalize
      const bestQuote = state.getBestQuote(conversationId);
      state.updateSession(conversationId, { status: 'COMPLETED' });

      const bestSummary = bestQuote
        ? `Best price at $${bestQuote.price}, available in ${bestQuote.availability}.`
        : 'Unable to determine a best quote from the responses received.';

      console.info(JSON.stringify({
        level: 'info',
        timestamp: new Date().toISOString(),
        requestId: req.id,
        message: 'Negotiation complete — best quote selected.',
        conversationId,
        bestContractor: bestQuote?.contractorName,
        bestPrice: bestQuote?.price,
      }));

      return res.status(200).json({
        status: 'success',
        action: 'negotiation_complete',
        quotesReceived,
        quotesNeeded,
        readyForUser: true,
        bestQuote: bestQuote
          ? {
              contractorName: bestQuote.contractorName,
              phone: bestQuote.contractorPhone,
              price: bestQuote.price,
              availability: bestQuote.availability,
              summary: bestSummary,
            }
          : null,
        allQuotes: updatedSession.quotes.map(q => ({
          contractorName: q.contractorName,
          phone: q.contractorPhone,
          price: q.price,
          availability: q.availability,
          available: q.available,
        })),
        messageToUser: `Great news! I've compared ${quotesReceived} quotes for your repair. ${bestSummary}`,
      });
    }

    // Not enough quotes yet — return progress
    console.info(JSON.stringify({
      level: 'info',
      timestamp: new Date().toISOString(),
      requestId: req.id,
      message: `Quote recorded (${quotesReceived}/${quotesNeeded}).`,
      conversationId,
    }));

    return res.status(200).json({
      status: 'success',
      action: 'quote_recorded',
      quotesReceived,
      quotesNeeded,
      readyForUser: false,
    });
  } catch (err) {
    next(err);
  }
}
