/**
 * Gemini image generation against the Generative Language REST API.
 * Pure network/response logic only — storage and retries live elsewhere.
 * Never logs the API key.
 */

import {
  IMAGE_API_BASE,
  IMAGE_GEN_TIMEOUT_MS,
  IMAGE_MODEL_ID,
  IMAGE_PROMPT_TEMPLATE,
} from "../config.js";

/** @typedef {{ok: true, blob: Blob} | {ok: false, reason: string}} GenResult */

/**
 * Prompt template for one event title.
 * @param {string} title
 * @returns {string}
 */
export function buildPrompt(title) {
  return IMAGE_PROMPT_TEMPLATE.replace("{title}", title);
}

/** @returns {string} */
export function endpointUrl() {
  return `${IMAGE_API_BASE}/models/${IMAGE_MODEL_ID}:generateContent`;
}

/**
 * Extract the first inline image part from a GenerateContent response,
 * or explain why there is none.
 * @param {unknown} payload
 * @returns {{mimeType: string, data: string} | {reason: string}}
 */
export function extractInlineImage(payload) {
  if (typeof payload !== "object" || payload === null) {
    return { reason: "empty response" };
  }
  const body = /** @type {Record<string, any>} */ (payload);
  if (body.error) {
    return { reason: body.error?.message ? String(body.error.message) : "API error" };
  }
  const candidates = body.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { reason: "no candidates — the prompt may have been blocked" };
  }
  const parts = candidates[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return { reason: candidates[0]?.finishReason ? `finishReason=${candidates[0].finishReason}` : "no content parts" };
  }
  for (const part of parts) {
    if (typeof part !== "object" || part === null) continue;
    const inline = part.inlineData;
    if (inline && typeof inline.data === "string" && typeof inline.mimeType === "string") {
      return { mimeType: inline.mimeType, data: inline.data };
    }
  }
  return { reason: "no image in response" };
}

/**
 * Decode a base64 payload into an image Blob.
 * @param {string} base64 @param {string} mimeType
 * @returns {Blob}
 */
export function base64ToBlob(base64, mimeType) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

/**
 * One generation request with the configured timeout. Throws on network
 * or timeout so the retry/queue layer can decide what to do.
 * @param {{apiKey: string, title: string}} input
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<GenResult>}
 */
export async function generateEventImage({ apiKey, title }, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_GEN_TIMEOUT_MS);
  try {
    const response = await fetchImpl(endpointUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(title) }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
    });
    if (!response.ok) {
      return { ok: false, reason: `HTTP ${response.status}` };
    }
    const payload = await response.json();
    const image = extractInlineImage(payload);
    if ("reason" in image) {
      return { ok: false, reason: image.reason };
    }
    return { ok: true, blob: base64ToBlob(image.data, image.mimeType) };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, reason: "Timed out" };
    }
    return { ok: false, reason: error instanceof Error ? error.message : "Network error" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Downscale an image blob to at most IMAGE_MAX_DIMENSION pixels on its
 * long edge and re-encode as WebP. Browser-only (canvas APIs).
 * @param {Blob} blob
 * @param {number} [maxDim]
 * @returns {Promise<Blob>}
 */
export async function resizeImageBlob(blob, maxDim = 512) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const context = /** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext("2d"));
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.convertToBlob({ type: "image/webp", quality: 0.85 });
}
