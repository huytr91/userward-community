import test from "node:test";
import assert from "node:assert/strict";
import { buildInterviewPlan, shouldOfferPostSendInterview } from "../app/lib/interview-pipeline.ts";

test("email automation asks where to save and when, not architecture", () => {
  const plan = buildInterviewPlan("Tạo automation lấy email và lưu file", "analyze");
  assert.equal(plan.source, "dictionary");
  assert.ok(plan.questions.some(question => question.id === "destination" || question.id === "schedule"));
  assert.ok(!plan.questions.some(question => question.id === "platform" || question.id === "audience"));
});

test("unfamiliar actionable request stays local and never implies a model interview", () => {
  const plan = buildInterviewPlan("Phân tích một ý tưởng lạ", "analyze");
  assert.equal(plan.source, "rule");
  assert.equal(plan.questions.length, 0);
  assert.equal("needsModelConsent" in plan, false);
  assert.doesNotMatch(JSON.stringify(plan), /local-retrieval|model-consent/);
});

test("English interview chrome has no Vietnamese leftovers", () => {
  const plan = buildInterviewPlan("Tạo automation lấy email và lưu file", "analyze", "en");
  assert.ok(plan.questions.length > 0);
  const text = plan.questions.map(question => `${question.label} ${question.ask} ${question.options.join(" ")}`).join(" ");
  assert.doesNotMatch(text, /[ăâđêôơư]/i);
});

test("English write/build goals do not ask architecture", () => {
  const plan = buildInterviewPlan("write the model for trading", "analyze", "en");
  assert.ok(!plan.questions.some(question => question.id === "platform" || question.id === "audience"));
  const text = plan.questions.map(question => `${question.label} ${question.ask} ${question.options.join(" ")}`).join(" ");
  assert.doesNotMatch(text, /[ăâđêôơư]/i);
});

test("interview tables are offered only after a free-form composer send", () => {
  assert.equal(shouldOfferPostSendInterview({ composerSend: true, alreadyPending: false, questionCount: 2 }), true);
  assert.equal(shouldOfferPostSendInterview({ composerSend: true, alreadyPending: true, questionCount: 2 }), false);
  assert.equal(shouldOfferPostSendInterview({ composerSend: false, alreadyPending: false, questionCount: 2 }), false);
  assert.equal(shouldOfferPostSendInterview({ composerSend: true, alreadyPending: false, questionCount: 0 }), false);
});
