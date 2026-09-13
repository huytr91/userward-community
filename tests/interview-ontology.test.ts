import test from "node:test";
import assert from "node:assert/strict";
import { classifyIntent, buildOntologyInterviewQuestions, isGoToMarketLike } from "../app/lib/interview-ontology.ts";
import {
  buildInterviewPlan,
  isActionableGoal,
  isInterviewAnswerClear,
} from "../app/lib/interview-pipeline.ts";
import {
  emptyPersonalPack,
  injectPersonalOptionsIntoQuestions,
  isMemorableInterviewValue,
  recordPersonalAnswer,
  suggestedPersonalOptions,
  PERSONAL_PACK_MIN_COUNT,
} from "../app/lib/personal-interview-pack.ts";

test("ontology classifies compare and data intents", () => {
  const compare = classifyIntent("check email body vs excel for amount and bank name");
  assert.equal(compare.ordinary, false);
  assert.equal(compare.family, "compare");
  const data = classifyIntent("Phân tích số liệu doanh thu trong excel");
  assert.equal(data.family, "analyze");
  assert.equal(data.domain, "data");
  assert.equal(classifyIntent("vì sao trời xanh").ordinary, true);
});

test("domain packs produce richer slots than outcome-only", () => {
  const compareQs = buildOntologyInterviewQuestions({
    draft: "đối chiếu bảng email và excel",
    executionMode: "analyze",
    locale: "en",
  });
  assert.ok(compareQs.some(question => question.id === "match_criteria"));
  const ops = buildOntologyInterviewQuestions({
    draft: "Tạo automation lấy email và lưu file",
    executionMode: "analyze",
    locale: "en",
  });
  assert.ok(ops.some(question => question.id === "destination" || question.id === "schedule"));
  assert.ok(ops.some(question => question.id === "source"), "unnamed email source should be asked");
  assert.equal(classifyIntent("nên chọn phương án A hay B").family, "decide");
});

test("GTM / viral goals require objective and channel before CLEAR", () => {
  assert.equal(isGoToMarketLike("viết chiến lược viral cho app"), true);
  const plan = buildInterviewPlan("viết chiến lược content viral go-to-market", "analyze", "vi");
  assert.equal(plan.lane, "local_interview");
  assert.ok(plan.questions.some(question => question.id === "objective"));
  assert.ok(plan.questions.some(question => question.id === "channel"));
  assert.ok(!plan.questions.some(question => question.id === "data_grain"));
});

test("research market goals use soft meta pack locally", () => {
  const gold = classifyIntent("phân tích thị trường vàng sắp tới");
  assert.equal(gold.family, "research");
  assert.equal(gold.gate, "soft");
  assert.equal(classifyIntent("gold market outlook next quarter").family, "research");
  assert.notEqual(classifyIntent("gold market outlook next quarter").family, "automate");
  const plan = buildInterviewPlan("phân tích thị trường vàng sắp tới", "analyze", "vi");
  assert.equal(plan.lane, "local_interview");
  assert.notEqual(plan.needsModelInterview, true);
  assert.ok(plan.questions.some(question => question.id === "timeframe" || question.id === "output_shape"));
  assert.ok(!plan.questions.some(question => question.id === "data_grain"));
});

test("buildInterviewPlan uses ontology; compare stays local when pack is rich", () => {
  assert.equal(isActionableGoal("có 1 email và 1 file excel, cần check khớp"), true);
  const plan = buildInterviewPlan("có 1 email và 1 file excel, cần check khớp", "analyze", "vi");
  assert.equal(plan.intentFamily, "compare");
  assert.equal(plan.lane, "local_interview");
  assert.notEqual(plan.needsModelInterview, true);
  assert.ok(plan.questions.some(question => question.id === "match_criteria"));
  const email = buildInterviewPlan("Tạo automation lấy email và lưu file", "analyze", "en");
  assert.equal(email.source, "ontology");
  assert.equal(email.lane, "local_interview");
  assert.notEqual(email.needsModelInterview, true);
});

test("personal pack remembers frequent clear answers only", () => {
  assert.equal(isMemorableInterviewValue("ok"), false);
  assert.equal(isMemorableInterviewValue("Local folder D:\\Reports"), true);
  let state = emptyPersonalPack(true);
  for (let i = 0; i < PERSONAL_PACK_MIN_COUNT; i++) {
    state = recordPersonalAnswer({ state, intent: "automate", slotId: "destination", value: "Local folder D:\\Reports" });
  }
  state = recordPersonalAnswer({ state, intent: "automate", slotId: "destination", value: "ok" });
  const suggestions = suggestedPersonalOptions({ state, intent: "automate", slotId: "destination" });
  assert.deepEqual(suggestions, ["Local folder D:\\Reports"]);
  const injected = injectPersonalOptionsIntoQuestions({
    questions: [{ id: "destination", label: "Where", ask: "Where?", options: ["OneDrive", "Google Drive"] }],
    state,
    intent: "automate",
  });
  assert.equal(injected[0].options[0], "Local folder D:\\Reports");
  assert.equal(isInterviewAnswerClear("ok"), false);
});
