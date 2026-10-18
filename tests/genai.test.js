import { test } from "node:test";
import assert from "node:assert/strict";

const {
  buildPrompt,
  extractInlineImage,
  base64ToBlob,
} = await import("../js/lib/genai.js");

test("buildPrompt fills the title into the template", () => {
  const prompt = buildPrompt("Team Pride Retro");
  assert.ok(!prompt.includes("{title}"));
  assert.ok(prompt.includes("Team Pride Retro"));
});

test("extractInlineImage pulls the first inline image part", () => {
  const payload = {
    candidates: [
      {
        content: {
          parts: [
            { text: "here is the art" },
            { inlineData: { mimeType: "image/png", data: "QUJD" } },
          ],
        },
      },
    ],
  };
  const image = extractInlineImage(payload);
  assert.ok(!("reason" in image));
  if (!("reason" in image)) {
    assert.equal(image.mimeType, "image/png");
    assert.equal(image.data, "QUJD");
  }
});

test("extractInlineImage explains API errors", () => {
  const err = extractInlineImage({ error: { message: "API key not valid" } });
  assert.ok("reason" in err && err.reason.includes("API key not valid"));
});

test("extractInlineImage explains missing candidates and no-image responses", () => {
  assert.ok("reason" in extractInlineImage({}));
  assert.ok(
    "reason" in
      extractInlineImage({
        candidates: [{ content: { parts: [{ text: "sorry" }] } }],
      }),
  );
  const blocked = extractInlineImage({
    candidates: [{ finishReason: "SAFETY", content: {} }],
  });
  assert.ok("reason" in blocked && blocked.reason.includes("SAFETY"));
});

test("base64ToBlob decodes bytes with the given mime type", () => {
  const blob = base64ToBlob("QUJD", "image/png");
  assert.equal(blob.type, "image/png");
});
