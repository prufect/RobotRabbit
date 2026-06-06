/**
 * GET /api/status/:conversationId — Session status endpoint.
 *
 * Returns the current state of a negotiation session including all quotes
 * received so far and the best quote (if the session is complete).
 */

import * as state from '../services/stateManager.js';
import { StateError } from '../utils/errors.js';

/**
 * Express handler for GET /api/status/:conversationId.
 */
export async function statusHandler(req, res, next) {
  try {
    const { conversationId } = req.params;

    if (!conversationId) {
      throw new StateError('conversationId parameter is required.');
    }

    const session = state.getSession(conversationId);

    if (!session) {
      throw new StateError(`No session found for conversationId "${conversationId}".`);
    }

    console.info(JSON.stringify({
      level: 'info',
      timestamp: new Date().toISOString(),
      requestId: req.id,
      message: 'Status check',
      conversationId,
      status: session.status,
    }));

    return res.status(200).json({
      status: 'success',
      session: {
        conversationId: session.conversationId,
        userId: session.userId,
        urgency: session.urgency,
        status: session.status,
        issueDetails: session.issueDetails,
        contractors: session.contractors,
        quotesReceived: session.quotes.length,
        quotes: session.quotes.map(q => ({
          contractorName: q.contractorName,
          phone: q.contractorPhone,
          price: q.price,
          availability: q.availability,
          available: q.available,
          receivedAt: q.receivedAt,
        })),
        bestQuote: session.bestQuote
          ? {
              contractorName: session.bestQuote.contractorName,
              phone: session.bestQuote.contractorPhone,
              price: session.bestQuote.price,
              availability: session.bestQuote.availability,
            }
          : null,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
}
