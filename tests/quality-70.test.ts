import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scoreQualityCase, summarizeScores, type QualityCase } from "../app/lib/quality-benchmark.ts";
import { clipConversationTurn, buildRecentConversation } from "../app/lib/chat-contract.ts";

const cases = JSON.parse(readFileSync(join(process.cwd(), "benchmarks", "quality-70", "cases.json"), "utf8")) as QualityCase[];

test("quality-70 catalog has 70 cases", () => {
  assert.equal(cases.length, 70);
  const ids = new Set(cases.map(item => item.id));
  assert.equal(ids.size, 70);
});

test("quality-70 suite meets routing/token/continuity bar", () => {
  const scores = cases.map(scoreQualityCase);
  const summary = summarizeScores(scores, 0.9);
  assert.equal(summary.total, 70);
  assert.ok(summary.ok, `suite failed: ${summary.failedIds.join(", ")}`);
  assert.ok(summary.avgSavedPct >= 25);
});

test("conversation history clips long assistant essays", () => {
  const long = "A".repeat(4000);
  const clipped = clipConversationTurn("assistant", long);
  assert.ok(clipped.length < 1200);
  const packed = buildRecentConversation([
    { kind: "message", role: "user", text: "API là gì?" },
    { kind: "message", role: "ai", text: long },
    { kind: "message", role: "user", text: "Còn database thì sao?" },
  ], 6_000);
  assert.ok(packed.some(item => item.role === "assistant"));
  assert.ok(packed.every(item => item.content.length <= 1300));
});
