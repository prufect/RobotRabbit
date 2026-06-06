/**
 * Image fetching and pre-processing service.
 *
 * Downloads an image from a URL, validates its type and size, and returns the
 * base64-encoded payload ready for Gemini's inline-data format.
 */

import config from '../config.js';
import { ImageProcessingError } from '../utils/errors.js';

/**
 * Fetch an image from `imageUrl` and return its base64 representation.
 *
 * @param {string} imageUrl — A publicly-accessible HTTP(S) URL.
 * @returns {Promise<{ base64: string, mimeType: string }>}
 * @throws {ImageProcessingError} on fetch failure, invalid type, or oversize payload.
 */
export async function fetchAndProcessImage(imageUrl) {
  let response;

  try {
    response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(15_000), // 15 s fetch timeout
      headers: { 'Accept': 'image/*' },
    });
  } catch (err) {
    throw new ImageProcessingError(
      `Failed to fetch image from URL: ${err.message}`,
      { imageUrl, cause: err.message },
    );
  }

  if (!response.ok) {
    throw new ImageProcessingError(
      `Image URL returned HTTP ${response.status}`,
      { imageUrl, httpStatus: response.status },
    );
  }

  // ── Determine MIME type ────────────────────────────────────────────────────
  const contentType = response.headers.get('content-type') ?? '';
  const mimeType = contentType.split(';')[0].trim().toLowerCase();

  if (!config.ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new ImageProcessingError(
      `Unsupported image type "${mimeType}". Accepted: ${config.ALLOWED_MIME_TYPES.join(', ')}`,
      { imageUrl, mimeType },
    );
  }

  // ── Read the full body as an ArrayBuffer ───────────────────────────────────
  const arrayBuffer = await response.arrayBuffer();

  if (arrayBuffer.byteLength > config.MAX_IMAGE_SIZE_BYTES) {
    const sizeMB = (arrayBuffer.byteLength / (1024 * 1024)).toFixed(1);
    throw new ImageProcessingError(
      `Image is ${sizeMB} MB — exceeds the ${config.MAX_IMAGE_SIZE_BYTES / (1024 * 1024)} MB limit.`,
      { imageUrl, sizeBytes: arrayBuffer.byteLength },
    );
  }

  // ── Convert to base64 ─────────────────────────────────────────────────────
  const base64 = Buffer.from(arrayBuffer).toString('base64');

  return { base64, mimeType };
}
