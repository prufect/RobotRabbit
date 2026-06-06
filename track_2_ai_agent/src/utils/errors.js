/**
 * Custom error classes and Express error-handler middleware.
 *
 * Every custom error carries:
 *  • A machine-readable `code` (e.g., "VALIDATION_ERROR").
 *  • An HTTP `statusCode`.
 *  • An optional `details` bag for structured context.
 */

// ─── Base Error ──────────────────────────────────────────────────────────────

export class AppError extends Error {
  /**
   * @param {string}  message    Human-readable description.
   * @param {string}  code       Machine-readable error code.
   * @param {number}  statusCode HTTP status code.
   * @param {object}  [details]  Optional extra context.
   */
  constructor(message, code, statusCode, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ─── Concrete Errors ─────────────────────────────────────────────────────────

export class ValidationError extends AppError {
  /** @param {string} message @param {object} [details] */
  constructor(message, details = {}) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class GeminiError extends AppError {
  /** @param {string} message @param {object} [details] */
  constructor(message, details = {}) {
    super(message, 'GEMINI_ERROR', 502, details);
  }
}

export class ImageProcessingError extends AppError {
  /** @param {string} message @param {object} [details] */
  constructor(message, details = {}) {
    super(message, 'IMAGE_PROCESSING_ERROR', 422, details);
  }
}

export class StateError extends AppError {
  /** @param {string} message @param {object} [details] */
  constructor(message, details = {}) {
    super(message, 'STATE_ERROR', 404, details);
  }
}

// ─── Express Error-Handler Middleware ─────────────────────────────────────────

/**
 * Final error-handler — must be registered AFTER all routes.
 * Always responds with JSON so upstream consumers never receive HTML stack traces.
 */
export function errorHandler(err, _req, res, _next) {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';

  // Log full error for observability; omit stack in production responses.
  console.error(JSON.stringify({
    level: 'error',
    timestamp: new Date().toISOString(),
    code,
    message: err.message,
    details: err.details ?? {},
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  }));

  res.status(statusCode).json({
    status: 'error',
    code,
    message: err.message,
    ...(Object.keys(err.details ?? {}).length > 0 && { details: err.details }),
  });
}
