import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

test("public hosting metadata is absent", () => {
  assert.equal(existsSync(".openai/hosting.json"), false);
});

test("runtime binds to loopback and provider routes enforce it", () => {
  const vite = readFileSync("vite.config.ts", "utf8");
  const chat = readFileSync("app/api/providers/chat/route.ts", "utf8");
  const providerTest = readFileSync("app/api/providers/test/route.ts", "utf8");
  assert.match(vite, /127\.0\.0\.1/);
  assert.doesNotMatch(vite, /0\.0\.0\.0/);
  assert.match(chat, /Userward Local chỉ nhận yêu cầu/);
  assert.match(providerTest, /Userward Local chỉ nhận yêu cầu/);
  assert.doesNotMatch(chat, /chatgpt\.site/);
});

test("API key persistence is session-only", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  assert.match(page, /const credentialStorage = sessionStorage/g);
  assert.doesNotMatch(page, /const credentialStorage = PRODUCT_EDITION/);
});
