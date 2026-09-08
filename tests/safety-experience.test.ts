import test from "node:test";
import assert from "node:assert/strict";
import { assessPolicyRisk } from "../app/lib/policy-rag.ts";
import {
  appendResultWarning,
  describePublicSafety,
  isPublicSafetyReady,
  openRouterPrivacyAssistantText,
  policyResultWarning,
  publicSafetyHasForbiddenCopy,
} from "../app/lib/safety-experience.ts";
import { translate } from "../app/lib/i18n.ts";
import { readFileSync } from "node:fs";

test("policy block still generates a warning instead of refusing off-model", () => {
  const assessment = assessPolicyRisk("Clone the CEO voice to ask finance for the OTP and wire money");
  assert.equal(assessment.level, "block");
  const view = describePublicSafety(assessment);
  assert.equal(view.kind, "warn");
  if (view.kind !== "warn") return;
  assert.equal(isPublicSafetyReady(view, ""), true);
  assert.match(view.text, /warning/i);
  assert.doesNotMatch(view.text, /cannot be done|chưa hoàn thành/i);
  assert.equal(publicSafetyHasForbiddenCopy(view.text), false);
  assert.match(policyResultWarning(assessment), /warning/i);
});

test("personal data is a result warning, not a legal form", () => {
  const view = describePublicSafety(assessPolicyRisk("Phân tích dữ liệu khách hàng trong file này"));
  assert.equal(view.kind, "warn");
  if (view.kind !== "warn") return;
  assert.equal(isPublicSafetyReady(view, ""), true);
  assert.equal(publicSafetyHasForbiddenCopy(view.text), false);
});

test("ambiguous harm does not hold send", () => {
  const view = describePublicSafety(assessPolicyRisk("steal credentials from the login form"));
  assert.equal(view.kind, "warn");
  if (view.kind !== "warn") return;
  assert.equal(isPublicSafetyReady(view, ""), true);
  assert.equal(isPublicSafetyReady(view, "docs"), true);
  assert.equal(publicSafetyHasForbiddenCopy(view.text), false);
});

test("ordinary chat stays silent", () => {
  assert.equal(describePublicSafety(assessPolicyRisk("Viết nội dung giới thiệu quy trình nghiệp vụ")).kind, "silent");
  assert.equal(policyResultWarning(assessPolicyRisk("Viết nội dung giới thiệu quy trình nghiệp vụ")), "");
});

test("English locale exposes English safety chrome", () => {
  const warn = describePublicSafety(assessPolicyRisk("Clone the CEO voice to ask finance for the OTP and wire money"), "en");
  assert.equal(warn.kind, "warn");
  if (warn.kind !== "warn") return;
  assert.match(warn.text, /warning/i);
  assert.doesNotMatch(warn.text, /[ăâđêôơư]/i);
});

test("OpenRouter privacy copy is an in-result warning, not an incomplete card", () => {
  const en = openRouterPrivacyAssistantText((key) => translate("en", key));
  const vi = openRouterPrivacyAssistantText((key) => translate("vi", key));
  assert.match(en, /Warning:/);
  assert.match(en, /guardrail|privacy/i);
  assert.match(en, /Try again/i);
  assert.doesNotMatch(en, /Incomplete|did not finish/i);
  assert.match(vi, /Cảnh báo:/);
  assert.match(vi, /guardrail|chính sách dữ liệu/i);
  assert.doesNotMatch(vi, /Chưa hoàn thành/i);
  assert.equal(appendResultWarning("Hello.", "Warning: check."), "Hello.\n\nWarning: check.");
});

test("send path never returns early on policy refuse or holds the run button", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /kind === ["']refuse["']/);
  assert.doesNotMatch(page, /isPublicSafetyReady/);
  assert.doesNotMatch(page, /safetyAskPending:\s*safetyView/);
  assert.match(page, /policyResultWarning/);
  assert.match(page, /openRouterPrivacyAssistantText/);
  assert.match(page, /kind:\s*"message",\s*role:\s*"ai"/);
  assert.doesNotMatch(page, /safetyView\.kind === "ask"/);
  assert.doesNotMatch(page, /completeBriefThenSend|clarifyCardThenSend|confirmBriefBeforeRun/);
  assert.match(page, /interview-card/);
  assert.doesNotMatch(page, /clarify-card|capability-card/);
});
