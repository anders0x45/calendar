import { test } from "node:test";
import assert from "node:assert/strict";

const {
  buildPrompt,
  extractImageResult,
  base64ToBlob,
} = await import("../js/lib/genai.js");
const { IMAGE_GEN_STEPS } = await import("../js/config.js");

test("buildPrompt fills the title into the template", () => {
  const prompt = buildPrompt("Team Pride Retro");
  assert.ok(!prompt.includes("{title}"));
  assert.ok(prompt.includes("Team Pride Retro"));
});

test("generateEventImage posts prompt + steps to the bridge and parses the image", async () => {
  const { generateEventImage } = await import("../js/lib/genai.js");
  /** @type {any[]} */
  const calls = [];
  const fake = async (url, init) => {
    calls.push({
      url,
      secret: /** @type {any} */ (init).headers["x-art-secret"],
      body: JSON.parse(/** @type {any} */ (init).body),
    });
    return new Response(
      JSON.stringify({ success: true, image: "QUJD" }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const result = await generateEventImage(
    { bridgeUrl: "https://bridge.example/workers.dev", artSecret: "s3cret", title: "Retro Night" },
    // @ts-expect-error test fetch stub
    fake,
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.blob.type, "image/jpeg");
  assert.equal(calls[0].url, "https://bridge.example/workers.dev");
  assert.equal(calls[0].secret, "s3cret");
  assert.equal(calls[0].body.steps, IMAGE_GEN_STEPS);
  assert.ok(calls[0].body.prompt.includes("Retro Night"));
});

test("generateEventImage surfaces bridge errors", async () => {
  const { generateEventImage } = await import("../js/lib/genai.js");
  const fake = async () =>
    new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  const result = await generateEventImage(
    { bridgeUrl: "https://bridge.example", artSecret: "bad", title: "x" },
    // @ts-expect-error test fetch stub
    fake,
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "unauthorized");
});

test("generateEventImage reports network failures as reasons", async () => {
  const { generateEventImage } = await import("../js/lib/genai.js");
  const fake = async () => {
    throw new Error("Failed to fetch");
  };
  const result = await generateEventImage(
    { bridgeUrl: "https://bridge.example", artSecret: "x", title: "y" },
    // @ts-expect-error test fetch stub
    fake,
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "Failed to fetch");
});

test("extractImageResult explains errors, empty bodies and missing images", () => {
  const err = extractImageResult({ error: "unauthorized" });
  assert.ok("reason" in err && err.reason === "unauthorized");
  assert.ok("reason" in extractImageResult(null));
  assert.ok("reason" in extractImageResult({}));
  assert.ok("reason" in extractImageResult({ success: true, image: 42 }));
  const ok = extractImageResult({ success: true, image: "QUJD" });
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
