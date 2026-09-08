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
  const hands = readFileSync("app/api/hands/route.ts", "utf8");
  assert.match(vite, /127\.0\.0\.1/);
  assert.doesNotMatch(vite, /0\.0\.0\.0/);
  assert.match(chat, /Userward Local chỉ nhận yêu cầu/);
  assert.match(providerTest, /Userward Local chỉ nhận yêu cầu/);
  assert.match(hands, /Userward Local chỉ nhận yêu cầu/);
  assert.doesNotMatch(hands, /127\.0\.0\.1:3000/);
  assert.doesNotMatch(chat, /chatgpt\.site/);
});

test("API key persistence is opt-in on this device", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  assert.match(page, /localStorage\.setItem\("minimum-provider-connection"/);
  assert.match(page, /sessionStorage\.setItem\("minimum-provider-connection"/);
  assert.match(page, /rememberKey/);
  assert.match(page, /if \(rememberKey\) \{ localStorage\.setItem\("minimum-provider-connection"/);
  assert.match(page, /else \{ sessionStorage\.setItem\("minimum-provider-connection"/);
  assert.match(page, /rememberKey&&provider\?t\("keyRemembered"\)/);
  assert.match(page, /rememberKey&&provider\?t\("keyRememberedShort"\)/);
  assert.doesNotMatch(page, /const credentialStorage = PRODUCT_EDITION/);
  assert.doesNotMatch(page, /SECURITY GATE|Policy RAG/i);
});

test("start script rebuilds when source is newer than dist", () => {
  const start = readFileSync("scripts/start-userward.ps1", "utf8");
  assert.match(start, /Test-NeedsBuild/);
  assert.match(start, /Stop-UserwardPort/);
  assert.match(start, /\$UserwardPort = 3001/);
  assert.match(start, /npm\.cmd run build/);
  assert.match(start, /LastWriteTimeUtc/);
  assert.doesNotMatch(start, /Stop-Port3000/);
});

test("CSS does not hide real copy with font-size 0 content overrides", () => {
  const css = readFileSync("app/globals.css", "utf8");
  assert.doesNotMatch(css, /credential-form>small\{[^}]*font-size:\s*0/);
  assert.doesNotMatch(css, /finance-summary>small\{[^}]*font-size:\s*0/);
  assert.doesNotMatch(css, /\.message-body:has\(\.inline-interview\)>p\{display:\s*none/);
  assert.doesNotMatch(css, /inline-interview header span:after\{content:/);
  assert.doesNotMatch(css, /inline-choices button:first-child:after\{content:/);
});
