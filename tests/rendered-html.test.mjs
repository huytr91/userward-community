import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("renders the Userward community workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Userward — AI that answers to you<\/title>/i);
  assert.match(html, /<span>Userward<\/span>/i);
  assert.match(html, />COMMUNITY</);
  assert.match(html, /New chat/);
  assert.match(html, /Connect model/);
  assert.match(html, /Chat · Files · Coding only/);
  assert.doesNotMatch(html, /PERSONAL TOOL REGISTRY/);
});

test("does not server-render credentials", async () => {
  const html = await (await render()).text();
  assert.doesNotMatch(html, /sk-[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(html, /art_v2_/);
  assert.doesNotMatch(html, /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/);
});
