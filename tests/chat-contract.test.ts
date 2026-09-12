import test from "node:test";
import assert from "node:assert/strict";
import { buildRecentConversation, chunkText, estimateTokens, normalizeProviderUsage, parsePendingPatch, sumConversationUsage } from "../app/lib/chat-contract.ts";
import { inferModelCapability, validateModelRequest } from "../app/lib/model-capabilities.ts";

test("conversation context keeps only real user and assistant messages", () => {
  const messages = buildRecentConversation([
    { kind: "decision", text: "policy" },
    { kind: "message", role: "user" as const, text: "Câu hỏi đầu" },
    { kind: "result", text: "network error" },
    { kind: "message", role: "ai" as const, text: "Câu trả lời đầu" },
  ]);
  assert.deepEqual(messages, [
    { role: "user", content: "Câu hỏi đầu" },
    { role: "assistant", content: "Câu trả lời đầu" },
  ]);
});

test("context budgeting and chunking keep requests bounded", () => {
  const chunks = chunkText("a\n".repeat(30_000), 10_000);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(chunk => chunk.length <= 10_000));
  assert.equal(estimateTokens("12345678"), 2);
  const messages = buildRecentConversation(Array.from({ length: 20 }, (_, index) => ({ kind: "message", role: index % 2 ? "ai" as const : "user" as const, text: "x".repeat(400) })), 500);
  assert.ok(messages.reduce((sum, item) => sum + estimateTokens(item.content), 0) <= 500);
});

test("capability enforcement rejects incompatible modalities", () => {
  const textOnly = inferModelCapability("DeepSeek", "deepseek-chat");
  assert.match(validateModelRequest(textOnly, [{ mime: "image/png" }], false) || "", /ảnh/);
  const multimodal = inferModelCapability("OpenRouter", "openai/gpt-5");
  assert.equal(validateModelRequest(multimodal, [{ mime: "application/pdf" }], true), null);
});

test("patch validator accepts safe files and rejects traversal or secrets", () => {
  const patch = parsePendingPatch(JSON.stringify({ summary: "ok", files: [{ path: "src/app.ts", operation: "update", content: "export {};" }] }));
  assert.equal(patch.files[0].path, "src/app.ts");
  assert.throws(() => parsePendingPatch(JSON.stringify({ files: [{ path: "../outside.ts", operation: "create", content: "x" }] })));
  assert.throws(() => parsePendingPatch(JSON.stringify({ files: [{ path: ".env", operation: "update", content: "SECRET=x" }] })));
  assert.throws(() => parsePendingPatch(JSON.stringify({ files: [
    { path: "a.ts", operation: "create", content: "x" },
    { path: "A.ts", operation: "update", content: "y" },
  ] })));
});

test("conversation usage estimates replies when the provider omitted usage", () => {
  const usage = normalizeProviderUsage({ usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
  assert.equal(usage?.totalTokens, 15);
  const stats = sumConversationUsage([
    { role: "user", text: "hello world from the user" },
    { role: "ai", text: "a longer assistant reply that should count" },
  ]);
  assert.ok(stats.total > 0);
  assert.ok(stats.measured >= 1);
  assert.ok(stats.output > 0);
});
