/**
 * Chrono.exe art bridge: CORS-enabled relay for Cloudflare Workers AI.
 * The calendar app (any origin) POSTs {prompt, steps} with the shared
 * secret; this worker runs flux-1-schnell through the native AI binding
 * and returns {success, image} — no Cloudflare API token ever lives in
 * the browser.
 */

const CORS_HEADS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, x-art-secret",
  "access-control-max-age": "86400",
};

/** @returns {Response} */
function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADS },
  });
}

/** @returns {Response} */
function preflight() {
  return new Response(null, { status: 204, headers: CORS_HEADS });
}

/** Clamp to the model's documented step range. */
function clampSteps(input) {
  const n = Number(input);
  if (!Number.isFinite(n)) return 4;
  return Math.max(1, Math.min(8, Math.round(n)));
}

export default {
  /**
   * @param {Request} request
   * @param {{AI: {run: (model: string, input: unknown) => Promise<unknown>},
   *         ART_SECRET?: string}} env
   */
  async fetch(request, env) {
    if (request.method === "OPTIONS") return preflight();
    if (request.method !== "POST") return json({ error: "POST only" }, 405);

    if (!env.ART_SECRET || request.headers.get("x-art-secret") !== env.ART_SECRET) {
      return json({ error: "unauthorized" }, 401);
    }

    const body = await request.json().catch(() => null);
    const prompt = typeof body?.prompt === "string" ? body.prompt : "";
    if (!prompt) return json({ error: "missing prompt" }, 400);

    try {
      const result = /** @type {any} */ (
        await env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
          prompt,
          steps: clampSteps(body?.steps ?? 4),
        })
      );
      const image = result?.image ?? result?.result?.image;
      if (typeof image !== "string" || image.length === 0) {
        return json({ error: "no image in model response" }, 502);
      }
      return json({ success: true, image });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "generation failed" }, 502);
    }
  },
};
