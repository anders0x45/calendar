import { test } from "node:test";
import assert from "node:assert/strict";

const {
  buildPrompt,
  endpointUrl,
  extractImageResult,
  base64ToBlob,
} = await import("../js/lib/genai.js");
const {
  IMAGE_MODEL_PATH,
  IMAGE_API_BASE,
  IMAGE_GEN_STEPS,
} = await import("../js/config.js");

test("buildPrompt fills the title into the template", () => {
  const prompt = buildPrompt("Team Pride Retro");
  assert.ok(!prompt.includes("{title}"));
  assert.ok(prompt.includes("Team Pride Retro"));
});

test("endpointUrl targets the Cloudflare account model path", () => {
  const url = endpointUrl("abc123");
  assert.equal(url, `${IMAGE_API_BASE}/accounts/abc123/ai/run/${IMAGE_MODEL_PATH}`);
});

test("endpointUrl encodes special characters in the account id", () => {
  assert.ok(!endpointUrl("../evil").includes("/accounts/../evil"));
});

test("generateEventImage posts prompt + steps and parses the image", async () => {
  const { generateEventImage } = await import("../js/lib/genai.js");
  /** @type {any[]} */
  const bodies = [];
  const fake = async (_url, init) => {
    bodies.push(JSON.parse(/** @type {any} */ (init.body)));
    return new Response(
      JSON.stringify({
        success: true,
        result: { image: "QUJD", msg: "Done in 42ms" },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const result = await generateEventImage(
    { apiToken: "tok", accountId: "acc", title: "Retro Night" },
    // @ts-expect-error test fetch stub
    fake,
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.blob.type, "image/jpeg");
  assert.equal(bodies[0].steps, IMAGE_GEN_STEPS);
  assert.ok(bodies[0].prompt.includes("Retro Night"));
});

test("generateEventImage surfaces Workers AI errors", async () => {
  const { generateEventImage } = await import("../js/lib/genai.js");
  const fake = async () =>
    new Response(
      JSON.stringify({ success: false, errors: [{ code: 7003, message: "Authentication error" }] }),
      { status: 403, headers: { "content-type": "application/json" } },
    );
  const result = await generateEventImage(
    { apiToken: "bad", accountId: "acc", title: "x" },
    // @ts-expect-error test fetch stub
    fake,
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.reason.includes("Authentication error"));
});

test("extractImageResult explains API errors and empty responses", () => {
  const err = extractImageResult({
    success: false,
    errors: [{ message: "Authentication error" }],
  });
  assert.ok("reason" in err && err.reason.includes("Authentication error"));
  assert.ok("reason" in extractImageResult(null));
  assert.ok("reason" in extractImageResult({}));
  assert.ok("reason" in extractImageResult({ success: true, result: { msg: "queued" } }));
  const ok = extractImageResult({ success: true, result: { image: "QUJD" } });
  assert.ok(!("reason" in ok));
  if (!("reason" in ok)) {
    assert.equal(ok.mimeType, "image/jpeg");
    assert.equal(ok.data, "QUJD");
  }
});

test("base64ToBlob decodes bytes with the given mime type", () => {
  const blob = base64ToBlob("QUJD", "image/png");
  assert.equal(blob.type, "image/png");
});
