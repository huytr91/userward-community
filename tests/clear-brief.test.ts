import test from "node:test";
import assert from "node:assert/strict";
import {
  buildClearBrief,
  CLEAR_BRIEF_VERSION,
  confirmClearBrief,
  formatClearBriefForPrompt,
  parseClearBrief,
  serializeClearBrief,
  summarizeClearBrief,
  updateClearBriefSlot,
  validateClearBriefForGenerate,
} from "../app/lib/clear-brief.ts";
import { emptyPersonalPack } from "../app/lib/personal-interview-pack.ts";
import { createExecutionReceipt, compileContextPack, createGoalContract } from "../app/lib/userward-core.ts";

test("buildClearBrief produces versioned draft with assumptions", () => {
  const brief = buildClearBrief({
    goal: "Write a GTM brief for Bitcoin ETF",
    questions: [
      { id: "objective", label: "Objective", ask: "What outcome?", options: ["Awareness"] },
      { id: "channel", label: "Channel", ask: "Where?", options: ["LinkedIn"] },
    ],
    answers: { objective: "Awareness among retail investors", channel: "LinkedIn posts weekly" },
    notes: "Keep under one page",
    gate: "soft",
    intentFamily: "write",
    lane: "local_interview",
    now: new Date("2026-09-13T12:00:00.000Z"),
    id: "brief-test",
  });
  assert.equal(brief.version, CLEAR_BRIEF_VERSION);
  assert.equal(brief.status, "draft");
  assert.equal(brief.slots.length, 2);
  assert.equal(brief.slots[0].source, "user");
  assert.equal(brief.slots[0].confidence, "high");
  assert.ok(brief.assumptions.length >= 1);
  assert.deepEqual(brief.missingRequired, []);
  const json = serializeClearBrief(brief);
  assert.equal(parseClearBrief(json)?.goal, brief.goal);
  assert.match(summarizeClearBrief(brief), /status=draft/);
  assert.match(formatClearBriefForPrompt(brief), /CLEAR_BRIEF_JSON:/);
});

test("vague answers get low confidence", () => {
  const brief = buildClearBrief({
    goal: "Draft post",
    questions: [{ id: "channel", label: "Channel", ask: "Where?", options: ["LinkedIn", "Email"] }],
    answers: { channel: "ok" },
    gate: "soft",
    intentFamily: "write",
  });
  assert.equal(brief.slots[0].confidence, "low");
});

test("suggested_pack source when answer matches frequent personal entry", () => {
  const pack = emptyPersonalPack(true);
  pack.entries.push({
    intent: "write",
    slotId: "channel",
    value: "LinkedIn company page",
    count: 5,
    lastUsedAt: Date.now(),
  });
  const brief = buildClearBrief({
    goal: "Draft post",
    questions: [{ id: "channel", label: "Channel", ask: "Where?", options: ["LinkedIn company page"] }],
    answers: { channel: "LinkedIn company page" },
    gate: "soft",
    intentFamily: "write",
    personalPack: pack,
  });
  assert.equal(brief.slots[0].source, "suggested_pack");
  assert.equal(brief.slots[0].confidence, "medium");
});

test("hard gate blocks generate when required slot is unclear", () => {
  const draft = buildClearBrief({
    goal: "Automate email to folder",
    questions: [
      { id: "destination", label: "Destination", ask: "Where?", options: ["Inbox"] },
      { id: "schedule", label: "Schedule", ask: "When?", options: ["Daily"] },
    ],
    answers: { destination: "ok", schedule: "Every weekday 9am" },
    gate: "hard",
    intentFamily: "automate",
    lane: "local_interview",
  });
  assert.ok(draft.missingRequired.includes("destination"));
  const check = validateClearBriefForGenerate(draft);
  assert.equal(check.ok, false);
  const fixed = updateClearBriefSlot(draft, "destination", "Gmail label Receipts");
  assert.equal(validateClearBriefForGenerate(fixed).ok, true);
  const confirmed = confirmClearBrief(fixed);
  assert.equal(confirmed.status, "confirmed");
  assert.ok(confirmed.confirmedAt);
});

test("passthrough brief carries soft assumption", () => {
  const brief = buildClearBrief({
    goal: "Summarize market outlook",
    questions: [],
    answers: {},
    gate: "soft",
    lane: "passthrough",
  });
  assert.match(brief.assumptions.join(" "), /Passthrough/);
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
    briefSummary: "status=confirmed · gate=soft · Objective: Awareness",
  });
  assert.equal(receipt.savings?.savedTokens, 800);
  assert.equal(receipt.briefId, "brief-1");
  assert.match(receipt.briefSummary || "", /gate=soft/);
});
