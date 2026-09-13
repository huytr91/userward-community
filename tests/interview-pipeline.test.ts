import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInterviewOnlyPrompt,
  buildInterviewPlan,
  buildUnclearFollowUpQuestions,
  effectiveInterviewAnswers,
  interviewSlotsComplete,
  isActionableGoal,
  isCompareLikeGoal,
  isInterviewAnswerClear,
  isInterviewSlotFilled,
  isShallowLocalInterview,
  localFallbackInterviewQuestions,
  mergeInterviewQuestions,
  missingInterviewSlotIds,
  parseModelInterviewQuestions,
  shouldMarkClarificationComplete,
  shouldOfferPostSendInterview,
  unclearInterviewSlotIds,
  INTERVIEW_ONLY_RULE,
  ORDINARY_CHAT_RULE,
  UNKNOWN_CONTENT_RULE,
} from "../app/lib/interview-pipeline.ts";

test("email automation asks where to save and when, not architecture", () => {
  const plan = buildInterviewPlan("Tạo automation lấy email và lưu file", "analyze");
  assert.equal(plan.source, "ontology");
  assert.notEqual(plan.needsModelInterview, true);
  assert.ok(plan.questions.some(question => question.id === "destination" || question.id === "schedule"));
  assert.ok(!plan.questions.some(question => question.id === "platform" || question.id === "audience"));
});

test("work intent catches need+artifact without classic verbs", () => {
  assert.equal(isActionableGoal("có 1 email và 1 file excel, cần xử lý bảng"), true);
  assert.equal(isActionableGoal("vì sao các AI thích bịa nội dung hơn là hỏi user"), false);
  assert.equal(isActionableGoal("sao Userward lại không trả lời câu hỏi đời thường"), false);
  assert.equal(isActionableGoal("random note", "execute"), true);
});

test("unfamiliar or shallow local plans request model interview", () => {
  const odd = buildInterviewPlan("Phân tích một ý tưởng lạ", "analyze");
  assert.equal(odd.needsModelInterview, true);
  const data = buildInterviewPlan("Phân tích số liệu doanh thu quý này", "analyze", "en");
  assert.equal(data.needsModelInterview, true);
  assert.ok(isShallowLocalInterview(data.questions));
  assert.match(INTERVIEW_ONLY_RULE, /Do not produce work products/i);
});

test("compare email vs excel triggers model interview", () => {
  const goal = "giờ có 1 email và 1 file excel, cần check xem bảng trong body email và file excel xem có khớp nhau về cột số tiền";
  assert.equal(isActionableGoal(goal), true);
  assert.equal(isCompareLikeGoal(goal), true);
  const plan = buildInterviewPlan(goal, "analyze", "vi");
  assert.equal(plan.needsModelInterview, true);
});

test("English interview chrome has no Vietnamese leftovers", () => {
  const plan = buildInterviewPlan("Tạo automation lấy email và lưu file", "analyze", "en");
  assert.ok(plan.questions.length > 0);
  const text = plan.questions.map(question => `${question.label} ${question.ask} ${question.options.join(" ")}`).join(" ");
  assert.doesNotMatch(text, /[ăâđêôơư]/i);
});

test("interview tables are offered only after a free-form composer send", () => {
  assert.equal(shouldOfferPostSendInterview({ composerSend: true, alreadyPending: false, questionCount: 2 }), true);
  assert.equal(shouldOfferPostSendInterview({ composerSend: true, alreadyPending: true, questionCount: 2 }), false);
  assert.equal(shouldOfferPostSendInterview({ composerSend: false, alreadyPending: false, questionCount: 2 }), false);
  assert.equal(shouldOfferPostSendInterview({ composerSend: true, alreadyPending: false, questionCount: 0 }), false);
});

test("hard gate: override notes do not bypass slots; free-text fills a slot", () => {
  const plan = buildInterviewPlan("Tạo automation lấy email và lưu file", "analyze", "en");
  assert.ok(plan.questions.length >= 2);
  assert.equal(interviewSlotsComplete({ questions: plan.questions, answers: {}, override: "Save under D:\\Reports when I click run" }), false);
  assert.equal(isInterviewSlotFilled("Not specified"), false);
  const freeTexts = Object.fromEntries(plan.questions.map(question => [question.id, `Detail for ${question.id}`]));
  assert.equal(interviewSlotsComplete({ questions: plan.questions, answers: {}, freeTexts }), true);
  const effective = effectiveInterviewAnswers(plan.questions, { [plan.questions[0].id]: "choice" }, { [plan.questions[0].id]: "typed" });
  assert.equal(effective[plan.questions[0].id], "typed");
  assert.ok(missingInterviewSlotIds({ questions: plan.questions, answers: {} }).length > 0);
});

test("unclear answers trigger follow-up builders", () => {
  assert.equal(isInterviewAnswerClear("ok"), false);
  assert.equal(isInterviewAnswerClear("Không có yêu cầu đặc biệt"), false);
  assert.equal(isInterviewAnswerClear("Match amount, bank name, and beneficiary exactly"), true);
  const questions = localFallbackInterviewQuestions("en");
  const answers = Object.fromEntries(questions.map(question => [question.id, "ok"]));
  assert.deepEqual(unclearInterviewSlotIds({ questions, answers }), questions.map(question => question.id));
  const follow = buildUnclearFollowUpQuestions({ questions, answers, locale: "en" });
  assert.equal(follow.length, questions.length);
  assert.match(follow[0].ask, /more specific/i);
});

test("clarification complete only when answers exist", () => {
  assert.equal(shouldMarkClarificationComplete(0), false);
  assert.equal(shouldMarkClarificationComplete(1), true);
});

test("merge and parse model interview questions", () => {
  const seed = localFallbackInterviewQuestions("en");
  const parsed = parseModelInterviewQuestions(`{"questions":[{"id":"cols","label":"Columns","ask":"Which columns must match?","options":["Amount + bank","Amount only","Other"]}]}`);
  const merged = mergeInterviewQuestions(seed, parsed);
  assert.ok(merged.some(question => question.id === "cols"));
  assert.ok(merged.length <= 4);
  assert.deepEqual(parseModelInterviewQuestions("Here is a tutorial step 1"), []);
  assert.match(buildInterviewOnlyPrompt("check email vs excel", "en", seed), /SEED QUESTIONS/);
});

test("unknown content rule forbids inventing unverified facts", () => {
  assert.match(UNKNOWN_CONTENT_RULE, /UNKNOWN CONTENT RULE/);
  assert.match(ORDINARY_CHAT_RULE, /ORDINARY CHAT/);
  assert.doesNotMatch(UNKNOWN_CONTENT_RULE, /guess is ok/i);
});
