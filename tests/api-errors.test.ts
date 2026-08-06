import assert from "node:assert/strict";
import test from "node:test";
import { validateAnalysisRequest } from "../lib/api-validation";
import { requestRemoteAnalysis } from "../lib/remote-analysis";

test("rejects unsupported image content before provider access", () => {
  const result = validateAnalysisRequest({
    question: "What is here?",
    imageDataUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAUEBA==",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 415);
});

test("rejects an oversized remote image", () => {
  const result = validateAnalysisRequest({
    question: "What is here?",
    imageDataUrl: `data:image/jpeg;base64,${"A".repeat(7_100_000)}`,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 413);
});

test("surfaces useful remote API errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "Remote vision is not configured." }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  try {
    await assert.rejects(
      requestRemoteAnalysis("data:image/jpeg;base64,AA==", "Describe it"),
      /not configured/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

