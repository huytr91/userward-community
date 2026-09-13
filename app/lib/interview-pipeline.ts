import { translate, type AppLocale } from "./i18n.ts";
import {
  buildOntologyInterviewQuestions,
  classifyIntent,
  HARD_SLOT_IDS,
  META_SLOT_IDS,
  RICH_DOMAIN_SLOT_IDS,
  type IntentFamily,
  type InterviewGate,
} from "./interview-ontology.ts";
import { injectPersonalOptionsIntoQuestions, type PersonalPackState } from "./personal-interview-pack.ts";

export type InterviewQuestion = { id: string; label: string; ask: string; options: string[]; multi?: boolean };

/**
 * Routing lanes (exhaust local first; passthrough last):
 * ordinary → answer directly
 * local_interview → ontology/personal pack enough
 * call_a_meta → thin local; Call A may only add meta slots
 * passthrough → exhausted local+Call A; generate with labeled assumptions
 */
export type InterviewLane = "ordinary" | "local_interview" | "call_a_meta" | "passthrough";

export type InterviewPlan = {
  questions: InterviewQuestion[];
  source: "rule" | "dictionary" | "model" | "ontology";
  lane: InterviewLane;
  gate: InterviewGate;
  needsModelInterview?: boolean;
  allowPassthroughOnCallAFail?: boolean;
  intentFamily?: IntentFamily | null;
  domain?: string;
  allowedSlotIds?: string[];
};

export type CallAResolution =
  | { action: "interview"; questions: InterviewQuestion[]; notice?: string }
  | { action: "passthrough" };

export { classifyIntent } from "./interview-ontology.ts";
export type { IntentFamily, DomainPackId, ClassifiedIntent, InterviewGate } from "./interview-ontology.ts";

/** True when the user is requesting work/deliverable scope, not ordinary Q&A. */
export function isActionableGoal(draft: string, executionMode: "analyze" | "execute" = "analyze"): boolean {
  const classified = classifyIntent(draft, executionMode);
  return !classified.ordinary && classified.family != null;
}

/** Compare / reconcile style goals. */
export function isCompareLikeGoal(draft: string): boolean {
  return classifyIntent(draft).family === "compare";
}

/** Local template is too thin — Call A meta still needed. */
export function isShallowLocalInterview(questions: InterviewQuestion[], gate: InterviewGate = "hard"): boolean {
  if (!questions.length) return true;
  if (questions.length >= 3) return false;
  const richHits = questions.filter(question => RICH_DOMAIN_SLOT_IDS.has(question.id)).length;
  if (gate === "soft") return richHits < 2;
  const hardHits = questions.filter(question => HARD_SLOT_IDS.has(question.id)).length;
  if (hardHits >= 2 || richHits >= 2) return false;
  return true;
}

function allowedSlotsForFamily(family: IntentFamily | null | undefined, gate: InterviewGate): string[] {
  if (gate === "soft" || family === "research" || family === "write" || family === "decide") {
    return ["timeframe", "output_shape", "audience", "constraints", "outcome", "evidence", "objective", "channel"];
  }
  if (family === "compare") return ["match_criteria", "evidence", "outcome", "constraints"];
  if (family === "automate") return ["source", "destination", "schedule", "scope", "outcome"];
  if (family === "build") return ["code_target", "existing", "outcome", "evidence"];
  if (family === "analyze" || family === "transform") return ["evidence", "data_grain", "outcome", "timeframe", "constraints"];
  return [...META_SLOT_IDS];
}

/**
 * Ontology + domain packs first; shallow → Call A meta only.
 * Soft open briefs use research meta pack so Call A is rare.
 * Passthrough is NOT chosen here — only after Call A is exhausted.
 */
export function buildInterviewPlan(
  draft: string,
  executionMode: "analyze" | "execute",
  locale: AppLocale = "en",
  personalPack?: PersonalPackState,
): InterviewPlan {
  const classified = classifyIntent(draft, executionMode);
  if (classified.ordinary || !classified.family) {
    return {
      questions: [],
      source: "rule",
      lane: "ordinary",
      gate: "none",
      intentFamily: null,
      domain: classified.domain,
    };
  }

  let questions = buildOntologyInterviewQuestions({ draft, executionMode, locale, classified });
  if (personalPack?.enabled) {
    questions = injectPersonalOptionsIntoQuestions({
      questions,
      state: personalPack,
      intent: classified.family,
    });
  }

  const compact = questions.slice(0, 4);
  const allowedSlotIds = allowedSlotsForFamily(classified.family, classified.gate);
  const shallow = isShallowLocalInterview(compact, classified.gate);
  // Call A only when local coverage is thin — compare no longer forces a model call when the pack is already rich.
  const needsCallA = !compact.length || shallow;

  if (needsCallA) {
    return {
      questions: compact,
      source: compact.length ? "ontology" : "rule",
      lane: "call_a_meta",
      gate: classified.gate,
      needsModelInterview: true,
      allowPassthroughOnCallAFail: classified.gate === "soft",
      intentFamily: classified.family,
      domain: classified.domain,
      allowedSlotIds,
    };
  }

  return {
    questions: compact,
    source: "ontology",
    lane: "local_interview",
    gate: classified.gate,
    intentFamily: classified.family,
    domain: classified.domain,
    allowedSlotIds,
  };
}

/** Offline / model-failure card so hard-gate users are never blocked without questions. */
export function localFallbackInterviewQuestions(locale: AppLocale = "en"): InterviewQuestion[] {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  return [
    { id: "outcome", label: t("qOutcomeLabel"), ask: t("qOutcomeAsk"), options: [t("optOutcomeAnalysis"), t("optOutcomeDoc"), t("optOutcomeScript"), t("optOutcomeOther")] },
    { id: "evidence", label: t("qEvidenceLabel"), ask: t("qEvidenceAsk"), options: [t("optEvidenceAttached"), t("optEvidencePaste"), t("optEvidenceDescribe")] },
  ];
}

/** Soft-gate fallback when Call A is unavailable but local seed is empty. */
export function softMetaFallbackInterviewQuestions(locale: AppLocale = "en"): InterviewQuestion[] {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  return [
    { id: "timeframe", label: t("qTimeframeLabel"), ask: t("qTimeframeAsk"), options: [t("optTimeNearTerm"), t("optTimeMonth"), t("optTimeQuarter"), t("optTimeOpen")] },
    { id: "output_shape", label: t("qOutputShapeLabel"), ask: t("qOutputShapeAsk"), options: [t("optOutSummary"), t("optOutRiskChecklist"), t("optOutArgumentFrame"), t("optOutFullWriteup")] },
    { id: "audience", label: t("qViewpointLabel"), ask: t("qViewpointAsk"), options: [t("optAudPersonal"), t("optAudMacro"), t("optAudNewsOnly"), t("optAudTeam")] },
  ];
}

/** Merge local seed questions with Call A questions (seed first, dedupe by id, max 4). */
export function mergeInterviewQuestions(seed: InterviewQuestion[], model: InterviewQuestion[]): InterviewQuestion[] {
  const byId = new Map<string, InterviewQuestion>();
  for (const question of seed) byId.set(question.id, question);
  for (const question of model) {
    if (!byId.has(question.id)) byId.set(question.id, question);
  }
  return [...byId.values()].slice(0, 4);
}

/**
 * Reject subject-matter quizzes. Keep only meta / requirement questions.
 * Heuristics: knowledge-answer stems, cause/effect quizzes, exam-style options.
 */
export function isKnowledgeQuizQuestion(question: InterviewQuestion): boolean {
  const ask = `${question.label} ${question.ask}`.toLowerCase();
  const quizStem =
    /nguyên nhân|cause of|why did|why does|what (is|are|was|were) the (main |primary )?(reason|cause|factor)|đâu là|which of the following|đáp án|kiến thức|giá .+ (tăng|giảm)|gold price|thị trường .+ (tăng|giảm) vì|correct answer|đúng nhất/;
  if (quizStem.test(ask)) return true;
  if (/^(what|which|who|when|where)\b.+\b(is|are|was|were|did|does)\b/i.test(question.ask) && !/want|need|should (this|we)|output|period|audience|constraint|save|run|based on|cover|shape|for\?/i.test(question.ask)) {
    // "What is the main driver of gold?" vs "What output do you want?"
    if (/driver|factor|reason|cause|definition|mean by|giá|price|thị trường/.test(ask)) return true;
  }
  const optionBlob = question.options.join(" ").toLowerCase();
  if (question.options.length >= 2 && /%|usd|\$|điểm phần trăm|basis point/.test(optionBlob) && !/forecast|dự đoán|constraint/.test(ask)) {
    return true;
  }
  return false;
}

export function filterMetaInterviewQuestions(
  questions: InterviewQuestion[],
  allowedSlotIds?: string[],
): InterviewQuestion[] {
  const allowed = allowedSlotIds?.length ? new Set(allowedSlotIds) : META_SLOT_IDS;
  return questions.filter(question => {
    if (isKnowledgeQuizQuestion(question)) return false;
    if (allowed.has(question.id)) return true;
    // Unknown id: keep only if ask looks like a brief meta question.
    const ask = question.ask.toLowerCase();
    return /want|need|output|period|time|audience|constraint|save|where|when|based on|cover|shape|góc nhìn|đầu ra|phạm vi|ràng buộc|kỳ|tuần|tháng/.test(ask)
      && !isKnowledgeQuizQuestion(question);
  });
}

/**
 * After Call A: keep meta questions; exhaust local/soft fallbacks before passthrough.
 * Passthrough is last resort only when soft gate allows it and no deterministic brief pack remains.
 */
export function resolveCallAInterviewResult(input: {
  seed: InterviewQuestion[];
  modelQuestions: InterviewQuestion[];
  gate: InterviewGate;
  allowPassthroughOnCallAFail?: boolean;
  allowedSlotIds?: string[];
  locale?: AppLocale;
}): CallAResolution {
  const locale = input.locale || "en";
  const filtered = filterMetaInterviewQuestions(input.modelQuestions, input.allowedSlotIds);
  const merged = mergeInterviewQuestions(input.seed, filtered);
  if (merged.length >= 2) return { action: "interview", questions: merged };
  if (input.seed.length >= 2) return { action: "interview", questions: input.seed };
  if (input.gate === "soft") {
    // Soft briefs still have a local meta pack — use it before any passthrough.
    return { action: "interview", questions: softMetaFallbackInterviewQuestions(locale), notice: "fallback" };
  }
  if (input.gate === "hard" || !input.allowPassthroughOnCallAFail) {
    return { action: "interview", questions: localFallbackInterviewQuestions(locale), notice: "fallback" };
  }
  return { action: "passthrough" };
}

/** Free-text for a slot wins over the selected choice. */
export function effectiveInterviewAnswers(
  questions: InterviewQuestion[],
  answers: Record<string, string>,
  freeTexts: Record<string, string> = {},
): Record<string, string> {
  const effective: Record<string, string> = {};
  for (const question of questions) {
    const free = (freeTexts[question.id] || "").trim();
    const choice = (answers[question.id] || "").trim();
    effective[question.id] = free || choice;
  }
  return effective;
}

/** Tables appear only after the first free-form send, never while the user is still typing. */
export function shouldOfferPostSendInterview(input: { composerSend: boolean; alreadyPending: boolean; questionCount: number }): boolean {
  return input.composerSend && !input.alreadyPending && input.questionCount > 0;
}

const UNSPECIFIED_SLOT = /^(not specified|chưa xác định|unsure|unknown|n\/a|none|không rõ)$/i;
const UNCLEAR_ANSWER =
  /^(ok|okay|oke|ừ|uh|um|yes|no|có|không|tùy|tùy bạn|tùy ai|whatever|something|anything|idk|ko biết|không biết|gì cũng được|maybe|perhaps|fine|được)$/i;
const VAGUE_CHOICE =
  /không có yêu cầu|no special|để ai chọn|let ai|not sure|chưa chắc|unsure|use the option ai|dùng phương án ai/i;

/** Empty or “unsure / not specified” does not count as a confirmed business fact. */
export function isInterviewSlotFilled(answer: string | undefined): boolean {
  const value = (answer || "").trim();
  if (!value) return false;
  return !UNSPECIFIED_SLOT.test(value);
}

/** Filled but still too vague to proceed with work (CLEAR-lite). */
export function isInterviewAnswerClear(answer: string | undefined): boolean {
  if (!isInterviewSlotFilled(answer)) return false;
  const value = (answer || "").trim();
  if (value.length < 3) return false;
  if (UNCLEAR_ANSWER.test(value)) return false;
  if (VAGUE_CHOICE.test(value)) return false;
  return true;
}

/**
 * Hard gate: every business slot must be confirmed via choice or per-question free-text.
 * A global notes/override string does NOT complete slots.
 */
export function interviewSlotsComplete(input: {
  questions: InterviewQuestion[];
  answers: Record<string, string>;
  freeTexts?: Record<string, string>;
  override?: string;
}): boolean {
  if (!input.questions.length) return true;
  const effective = effectiveInterviewAnswers(input.questions, input.answers, input.freeTexts);
  return input.questions.every(question => isInterviewSlotFilled(effective[question.id]));
}

export function missingInterviewSlotIds(input: {
  questions: InterviewQuestion[];
  answers: Record<string, string>;
  freeTexts?: Record<string, string>;
  override?: string;
}): string[] {
  if (!input.questions.length) return [];
  const effective = effectiveInterviewAnswers(input.questions, input.answers, input.freeTexts);
  return input.questions.filter(question => !isInterviewSlotFilled(effective[question.id])).map(question => question.id);
}

export function unclearInterviewSlotIds(input: {
  questions: InterviewQuestion[];
  answers: Record<string, string>;
  freeTexts?: Record<string, string>;
}): string[] {
  const effective = effectiveInterviewAnswers(input.questions, input.answers, input.freeTexts);
  return input.questions.filter(question => isInterviewSlotFilled(effective[question.id]) && !isInterviewAnswerClear(effective[question.id])).map(question => question.id);
}

/** Build a follow-up card for slots that were answered but unclear. */
export function buildUnclearFollowUpQuestions(input: {
  questions: InterviewQuestion[];
  answers: Record<string, string>;
  freeTexts?: Record<string, string>;
  locale?: AppLocale;
}): InterviewQuestion[] {
  const locale = input.locale || "en";
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const effective = effectiveInterviewAnswers(input.questions, input.answers, input.freeTexts);
  const unclear = input.questions.filter(question => isInterviewSlotFilled(effective[question.id]) && !isInterviewAnswerClear(effective[question.id]));
  return unclear.map(question => ({
    id: `follow_${question.id}`,
    label: question.label,
    ask: locale === "vi"
      ? `Bạn trả lời “${effective[question.id]}” — hãy nói rõ hơn (cụ thể số liệu, nơi lưu, tiêu chí, hoặc phương án thật)?`
      : `You answered “${effective[question.id]}” — please be more specific (numbers, destination, criteria, or your real option)?`,
    options: question.options.length >= 2
      ? question.options
      : [t("optEvidenceDescribe"), t("optOutcomeOther"), locale === "vi" ? "Tôi sẽ viết rõ bên dưới" : "I will write details below"],
  }));
}

/**
 * Call A: ask only what the USER wants clarified about their request.
 * Never quiz subject-matter knowledge.
 */
export const INTERVIEW_ONLY_RULE = [
  "MODE: INTERVIEW ONLY — REQUIREMENTS META, NOT SUBJECT QUIZ.",
  "Ask what the USER wants clarified about their request (scope, period, output shape, audience, constraints, evidence). Never quiz them on the subject matter.",
  "Forbidden: knowledge-test questions (causes, definitions, “main reason gold fell”, exam-style answers). Those are for the later work call after CLEAR.",
  "Output ONLY valid JSON (no markdown fences, no prose):",
  '{"questions":[{"id":"short_id","label":"short label","ask":"Question ending with?","options":["A","B","C"],"multi":false}]}',
  "Rules:",
  "- 2 to 4 questions.",
  "- Each ask must end with ?.",
  "- Each question needs 2 to 4 short options. The UI also lets the user write a free description per question.",
  "- Prefer ids from ALLOWED SLOT IDS when provided.",
  "- Do not produce work products: no procedures, implementations, scripts, code, patches, reports, or prescribed solution paths.",
  "- Do not finish the user's task in this response.",
  "- Never ask the user to choose libraries, frameworks, APIs, architecture, folder layout, or test tools.",
  "- Match the language of the user goal.",
  "- If SEED QUESTIONS are provided, keep useful ones and add only missing material META slots (do not duplicate).",
].join("\n");

/** Last-resort generate after interview packs were exhausted — still deliver a useful answer. */
export const PASSTHROUGH_GENERATE_RULE = [
  "MODE: PASSTHROUGH GENERATE (last resort after interview packs were exhausted).",
  "Answer the USER GOAL with a useful draft. Do not refuse for lack of perfect context.",
  "State brief assumptions in one short line when needed, label inferences, and avoid fake precise citations or made-up measured numbers.",
  "Do not invent side-effect facts (destination, schedule, overwrite policy, folder paths) that were never stated.",
  "Never claim an external action or file write without tool evidence.",
  "Forbidden ending: only “not enough information” with no draft and no clarifying questions.",
].join("\n");

/** After brief answers: deliver work; interview is for CLEAR, not refusal. */
export const DELIVERABLE_AFTER_BRIEF_RULE = [
  "MODE: DELIVER THE WORK (interview was to clarify, not to refuse).",
  "Produce a useful answer for the USER GOAL using CLARIFICATION ANSWERS when present.",
  "If one material fact is still unknown and blocks any useful draft: ask at most 1–2 clarifying questions (each ends with ?, short options), then stop.",
  "Otherwise write the deliverable. Label soft assumptions in one short line — do not invent side-effect facts (paths, schedules, overwrite).",
  "Forbidden ending: a reply that only says there is not enough data / cannot answer / need more info, without either (a) those 1–2 questions or (b) a substantive draft with labeled assumptions.",
  "Never quiz subject-matter knowledge. Never claim an external action without tool evidence.",
].join("\n");

/**
 * True when the model ended in a thin refusal instead of a draft or clarifying ask.
 * Used to reopen interview so the user is not stuck.
 */
export function looksLikeInsufficientAnswer(text: string): boolean {
  const value = (text || "").trim();
  if (!value) return true;
  const lower = value.toLowerCase();
  const refusal =
    /không đủ (thông tin|dữ liệu|ngữ cảnh|context)|not enough (information|data|context|detail)|insufficient (information|data|context)|thiếu (thông tin|dữ liệu|chi tiết).{0,40}(để|để có thể|before|to )|cannot (answer|proceed|write|provide|draft).{0,60}(without|until|more)|unable to (provide|write|draft|answer)|chỉ (có thể )?(đưa|cho|phác) (một )?(khung|outline|framework) chung|only (a )?(generic |high-level )?(framework|outline|skeleton)|cần thêm (thông tin|chi tiết).{0,20}(trước khi|before|để)/i;
  if (!refusal.test(lower)) return false;
  // Long substantive drafts that mention limits are OK.
  if (value.length > 900 && /\n/.test(value) && !/^(tôi không|i (can't|cannot|don't)|xin lỗi|sorry)/i.test(value.slice(0, 80))) {
    return false;
  }
  return true;
}

/** Extra CLEAR questions when a thin answer shows the brief is still incomplete. */
export function buildContextGapFollowUpQuestions(locale: AppLocale = "en", goal = ""): InterviewQuestion[] {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const gtm = /viral|go-?to-?market|gtm|chiến lược|content|marketing|tiktok|instagram|launch|ra mắt/i.test(goal);
  if (gtm || /viết|write|draft|soạn/i.test(goal)) {
    return [
      { id: "objective", label: t("qObjectiveLabel"), ask: t("qObjectiveAsk"), options: [t("optObjProduct"), t("optObjService"), t("optObjPersonalBrand"), t("optObjOther")] },
      { id: "channel", label: t("qChannelLabel"), ask: t("qChannelAsk"), options: [t("optChSocial"), t("optChBlog"), t("optChEmail"), t("optChMulti")] },
    ];
  }
  return [
    { id: "output_shape", label: t("qOutputShapeLabel"), ask: t("qOutputShapeAsk"), options: [t("optOutSummary"), t("optOutRiskChecklist"), t("optOutArgumentFrame"), t("optOutFullWriteup")] },
    { id: "constraints", label: t("qConstraintsLabel"), ask: t("qConstraintsAsk"), options: [t("optConPublishedOnly"), t("optConNoForecast"), t("optConLabelGuesses"), t("optConNoSpecial")] },
  ];
}

export function buildInterviewOnlyPrompt(
  goal: string,
  locale: AppLocale,
  seed: InterviewQuestion[] = [],
  options: { intentFamily?: string | null; allowedSlotIds?: string[] } = {},
): string {
  const lang = locale === "vi" ? "Vietnamese" : "the same language as the user goal";
  const seedBlock = seed.length
    ? `\n\nSEED QUESTIONS (keep if useful, add missing meta slots only):\n${JSON.stringify({ questions: seed })}`
    : "";
  const familyBlock = options.intentFamily ? `\nIntent family: ${options.intentFamily}.` : "";
  const allowBlock = options.allowedSlotIds?.length
    ? `\nALLOWED SLOT IDS (prefer these ids only): ${options.allowedSlotIds.join(", ")}.`
    : "";
  return `${INTERVIEW_ONLY_RULE}${familyBlock}${allowBlock}\nPreferred question language: ${lang}.\n\nUSER GOAL:\n${goal}${seedBlock}`;
}

/** Parse Call A JSON into interview questions; empty when invalid. */
export function parseModelInterviewQuestions(text: string): InterviewQuestion[] {
  const raw = (text || "").trim();
  if (!raw) return [];
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence?.[1]?.trim() || raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as { questions?: unknown };
    if (!Array.isArray(parsed.questions)) return [];
    const questions: InterviewQuestion[] = [];
    for (const item of parsed.questions.slice(0, 4)) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const ask = String(row.ask || "").trim();
      const label = String(row.label || ask || "").trim();
      const id = String(row.id || `q${questions.length + 1}`).trim().replace(/\s+/g, "_").slice(0, 40);
      const options = Array.isArray(row.options)
        ? row.options.map(option => String(option || "").trim()).filter(Boolean).slice(0, 6)
        : [];
      if (!ask || options.length < 2) continue;
      const askNormalized = /\?\s*$/.test(ask) ? ask : `${ask}?`;
      questions.push({ id: id || `q${questions.length + 1}`, label: label.slice(0, 80), ask: askNormalized, options, multi: Boolean(row.multi) });
    }
    return questions;
  } catch {
    return [];
  }
}

/** True only when clarification answers (or notes) were actually supplied. */
export function shouldMarkClarificationComplete(interviewPartsLength: number): boolean {
  return interviewPartsLength > 0;
}

/** Injected into provider prompts for work/deliverables: unknown facts → interview only. */
export const UNKNOWN_CONTENT_RULE = [
  "UNKNOWN CONTENT RULE (work / deliverables only):",
  "Applies when the user wants a deliverable, automation, analysis of their data, or a material business decision.",
  "A business fact is KNOWN only if it appears in USER GOAL, CLARIFICATION ANSWERS, USER NOTES, attached file text, or tool evidence.",
  "If a material business fact is UNKNOWN: ask interview-style clarifying questions only (numbered, each ends with ?, short choice options).",
  "Ask what the user wants clarified about their request — never quiz subject-matter knowledge.",
  "Forbidden while UNKNOWN: inventing numbers, citations, names, destinations, schedules, file contents, or user intent for side effects.",
  "Do not produce a completion claim that depends on an UNKNOWN side-effect fact (where to save, when to run).",
  "For open writing/analysis: prefer a useful draft with labeled assumptions over a reply that only refuses for missing context.",
  "Never answer with policy chrome (do not start replies with INFERENCE:, SOURCE:, VERIFICATION:, or “no source needed”).",
].join("\n");

/** Ordinary Q&A: answer the human question; do not turn the reply into a compliance memo. */
export const ORDINARY_CHAT_RULE = [
  "MODE: ORDINARY CHAT.",
  "Answer the user's question directly in clear natural language.",
  "Be helpful and substantive. Do not refuse ordinary conversation, explanations, or opinions.",
  "Do not open with INFERENCE:, SOURCE:, VERIFICATION:, OUTPUT:, or similar policy labels.",
  "Do not say “no actionable step” or “no file change requested” unless the user asked about actions/files.",
  "For general knowledge, answer normally; if unsure, say so briefly in prose — do not invent precise citations or fake measured numbers.",
  "Interview/clarifying cards are only for missing business slots on actionable work, not for everyday questions.",
].join("\n");
