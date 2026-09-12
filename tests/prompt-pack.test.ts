import test from "node:test";
import assert from "node:assert/strict";
import { buildPromptComparison, measureContextPackSavings } from "../app/lib/prompt-pack.ts";

test("compact chat prompt uses fewer tokens than free-format dump", () => {
  const result = buildPromptComparison("Summarize this week's project risks in five bullets.");
  assert.ok(result.compactTokens < result.freeTokens);
  assert.ok(result.savedPct >= 40);
  assert.ok(result.savedTokens === result.freeTokens - result.compactTokens);
  assert.doesNotMatch(result.compact, /UNUSED PROJECT HISTORY/);
});

test("measureContextPackSavings compares packed prompt vs free-format baseline", () => {
  const goal = "List three risks.";
  const packed = `MODE: DIRECT CHAT\nUSER GOAL:\n${goal}`;
  const measured = measureContextPackSavings(packed, goal);
  assert.ok(measured.compactTokens < measured.freeTokens);
  assert.ok(measured.savedPct > 0);
  assert.equal(measured.savedTokens, measured.freeTokens - measured.compactTokens);
});
