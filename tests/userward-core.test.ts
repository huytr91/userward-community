import test from "node:test";
import assert from "node:assert/strict";
import { compileContextPack, createExecutionReceipt, createGoalContract, routeForUser, USER_INTEREST_CONSTITUTION } from "../app/lib/userward-core.ts";

test("constitution encodes user-aligned routing and approval", () => {
  assert.ok(USER_INTEREST_CONSTITUTION.some(rule => rule.includes("least expensive qualified")));
  assert.ok(USER_INTEREST_CONSTITUTION.some(rule => rule.includes("without explicit")));
});

test("free-first contract cannot silently upgrade", () => {
  const goal = createGoalContract({ objective: "Normalize this CSV", executionMode: "analyze", hasFolder: false, hasAttachments: true, freeEligible: true, budgetMode: "balanced" });
  assert.equal(goal.budget.allowPaidUpgrade, false);
  assert.equal(goal.budget.mode, "free-first");
  assert.match(routeForUser(goal).method, /Deterministic/);
  assert.equal(routeForUser(goal).commercialInfluence, "none");
});

test("context pack excludes unrelated history and receipt does not invent changes", () => {
  const goal = createGoalContract({ objective: "Summarize this file", executionMode: "analyze", hasFolder: false, hasAttachments: true, freeEligible: false, budgetMode: "balanced" });
  const context = compileContextPack({ goal, policy: "minimum context", attachmentTexts: ["hello"] });
  const receipt = createExecutionReceipt({ status: "completed", model: "provider/model", context });
  assert.ok(context.excluded.includes("unrelated conversation history"));
  assert.deepEqual(receipt.changes, []);
  assert.deepEqual(receipt.evidence, ["Provider returned final content"]);
});
