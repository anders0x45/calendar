/**
 * Cloudflare Workers AI image generation (AI REST API, flux-1-schnell).
 * Pure network/response logic only — storage and retries live elsewhere.
 * Never logs the API token or account id.
 */

import {
  IMAGE_API_BASE,
  IMAGE_GEN_STEPS,
  IMAGE_GEN_TIMEOUT_MS,
  IMAGE_MODEL_PATH,
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

/**
 * Workers AI run endpoint for the configured model path.
 * @param {string} accountId
 * @returns {string}
 */
export function endpointUrl(accountId) {
  return `${IMAGE_API_BASE}/accounts/${encodeURIComponent(accountId)}/ai/run/${IMAGE_MODEL_PATH}`;
}

/**
 * Extract the base64 image from a Workers AI run response, or explain
 * why there is none.
 * @param {unknown} payload
 * @returns {{mimeType: string, data: string} | {reason: string}}
 */
export function extractImageResult(payload) {
  if (typeof payload !== "object" || payload === null) {
    return { reason: "empty response" };
  }
  const body = /** @type {Record<string, any>} */ (payload);
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    const parts = body.errors
      .map((e) => (typeof e === "object" && e !== null ? String(e.message ?? "") : String(e)))
      .filter(Boolean);
    return { reason: parts.length > 0 ? parts.join("; ") : "API error" };
  }
  if (body.success === false) {
    return { reason: "API error" };
  }
  const image = body.result?.image;
  if (typeof image === "string" && image.length > 0) {
    return { mimeType: "image/jpeg", data: image };
  }
  if (typeof body.result?.msg === "string") {
    return { reason: body.result.msg };
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
 * @param {{apiToken: string, accountId: string, title: string}} input
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<GenResult>}
 */
export async function generateEventImage({ apiToken, accountId, title }, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_GEN_TIMEOUT_MS);
  try {
    const response = await fetchImpl(endpointUrl(accountId), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiToken}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        prompt: buildPrompt(title),
        steps: IMAGE_GEN_STEPS,
      }),
    });
    const payload = await response.json().catch(() => null);
    const image = extractImageResult(payload);
    if ("reason" in image) {
      if (!response.ok && image.reason === "API error") {
        return { ok: false, reason: `HTTP ${response.status}` };
      }
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
