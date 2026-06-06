/**
 * Request-body validation helpers.
 *
 * Each validator returns `{ valid: boolean, errors: string[] }`.
 * Errors are human-readable sentences suitable for returning in API responses.
 */

// Simple URL pattern — intentionally permissive; we only reject obviously bad strings.
const URL_RE = /^https?:\/\/.+/i;

/**
 * Validate the request body for `POST /api/analyze`.
 * @param {object} body
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAnalyzeRequest(body) {
  const errors = [];

  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Request body must be a JSON object.'] };
  }

  if (!body.conversationId || typeof body.conversationId !== 'string') {
    errors.push('conversationId is required and must be a string.');
  }

  if (!body.userId || typeof body.userId !== 'string') {
    errors.push('userId is required and must be a string.');
  }

  if (!body.imageUrl || typeof body.imageUrl !== 'string') {
    errors.push('imageUrl is required and must be a string.');
  } else if (!URL_RE.test(body.imageUrl)) {
    errors.push('imageUrl must be a valid HTTP or HTTPS URL.');
  }

  // urgency is optional — default to "normal" downstream
  if (body.urgency !== undefined && typeof body.urgency !== 'string') {
    errors.push('urgency must be a string when provided.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate the request body for `POST /api/contractor-reply`.
 * @param {object} body
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateContractorReplyRequest(body) {
  const errors = [];

  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Request body must be a JSON object.'] };
  }

  if (!body.conversationId || typeof body.conversationId !== 'string') {
    errors.push('conversationId is required and must be a string.');
  }

  if (!body.contractorPhone || typeof body.contractorPhone !== 'string') {
    errors.push('contractorPhone is required and must be a string.');
  }

  if (!body.contractorName || typeof body.contractorName !== 'string') {
    errors.push('contractorName is required and must be a string.');
  }

  if (!body.messageBody || typeof body.messageBody !== 'string') {
    errors.push('messageBody is required and must be a string.');
  }

  return { valid: errors.length === 0, errors };
}
