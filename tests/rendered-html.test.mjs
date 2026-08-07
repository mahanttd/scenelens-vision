import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the general-purpose SceneLens application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>SceneLens/);
  assert.match(html, /REAL-TIME VISUAL ASSISTANCE/);
  assert.match(html, /365 \+ OPEN VOCABULARY/);
  assert.match(html, /SCENE INTELLIGENCE/);
  assert.match(html, /FIND ANYTHING/);
  assert.match(html, /nearly any named object/i);
  assert.match(html, /0(?:<!-- -->)? learned names/i);
  assert.match(html, /Ask about this frame/);
  assert.match(html, /Is that a water bottle/);
  assert.match(html, /virtually unlimited named-object searches/i);
  assert.match(html, /NO FACIAL RECOGNITION/);
  assert.match(html, /CAMERA SOURCE/);
  assert.doesNotMatch(html, /aerospace|aircraft|airworthiness/i);
  assert.doesNotMatch(html, /SECURITY INTELLIGENCE|NO SUSPICION SCORE/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("starter preview has been removed", async () => {
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
});
