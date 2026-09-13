import test from "node:test";
import assert from "node:assert/strict";
import {
  buildClearBrief,
  CLEAR_BRIEF_VERSION,
  parseClearBrief,
  serializeClearBrief,
  summarizeClearBrief,
} from "../app/lib/clear-brief.ts";
import { emptyPersonalPack } from "../app/lib/personal-interview-pack.ts";
import { createExecutionReceipt, compileContextPack, createGoalContract } from "../app/lib/userward-core.ts";

test("buildClearBrief produces versioned inspectable slots", () => {
  const brief = buildClearBrief({
    goal: "Write a GTM brief for Bitcoin ETF",
    questions: [
      { id: "objective", label: "Objective", ask: "What outcome?", options: ["Awareness"] },
      { id: "channel", label: "Channel", ask: "Where?", options: ["LinkedIn"] },
    ],
    answers: { objective: "Awareness among retail investors", channel: "LinkedIn" },
    notes: "Keep under one page",
    gate: "soft",
    intentFamily: "write",
    now: new Date("2026-09-13T12:00:00.000Z"),
    id: "brief-test",
  });
  assert.equal(brief.version, CLEAR_BRIEF_VERSION);
  assert.equal(brief.id, "brief-test");
  assert.equal(brief.slots.length, 2);
  assert.equal(brief.slots[0].source, "user");
  assert.equal(brief.slots[0].confidence, "high");
  assert.equal(brief.notes, "Keep under one page");
  const json = serializeClearBrief(brief);
  assert.equal(parseClearBrief(json)?.goal, brief.goal);
  assert.match(summarizeClearBrief(brief), /Objective:/);
});

test("suggested_pack source when answer matches frequent personal entry", () => {
  const pack = emptyPersonalPack(true);
  pack.entries.push({
    intent: "write",
    slotId: "channel",
    value: "LinkedIn",
    count: 5,
    lastUsedAt: Date.now(),
  });
  const brief = buildClearBrief({
    goal: "Draft post",
    questions: [{ id: "channel", label: "Channel", ask: "Where?", options: ["LinkedIn"] }],
    answers: { channel: "LinkedIn" },
    gate: "soft",
    intentFamily: "write",
    personalPack: pack,
  });
  assert.equal(brief.slots[0].source, "suggested_pack");
  assert.equal(brief.slots[0].confidence, "medium");
});

test("execution receipt carries counterfactual savings and brief summary", () => {
  const goal = createGoalContract({
    objective: "Summarize risks",
    executionMode: "analyze",
    hasFolder: false,
    hasAttachments: false,
    freeEligible: false,
    budgetMode: "balanced",
  });
  const context = compileContextPack({ goal, policy: "compact", attachmentTexts: [] });
  const receipt = createExecutionReceipt({
    status: "completed",
    model: "provider/model",
    context,
    savings: { compactTokens: 400, freeTokens: 1200, savedTokens: 800, savedPct: 66.7 },
    briefId: "brief-1",
    briefSummary: "gate=soft · Objective: Awareness",
  });
  assert.equal(receipt.savings?.savedTokens, 800);
  assert.equal(receipt.briefId, "brief-1");
  assert.match(receipt.briefSummary || "", /gate=soft/);
});
