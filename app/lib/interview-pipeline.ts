import { translate, type AppLocale } from "./i18n.ts";

export type InterviewQuestion = { id: string; label: string; ask: string; options: string[]; multi?: boolean };
/**
 * Local dictionary first. Shallow or uncovered goals set `needsModelInterview`
 * so Call A (interview-only) can merge tailored questions.
 */
export type InterviewPlan = {
  questions: InterviewQuestion[];
  source: "rule" | "dictionary" | "model";
  needsModelInterview?: boolean;
};

const WORK_ACTION =
  /tạo|sửa|xây|viết|chạy|xử lý|giúp|lọc|tính|tổng hợp|chuẩn hóa|chuyển đổi|chuyển|đọc|parse|import|export|merge|join|validate|review|sync|extract|convert|transform|tự động|automation|workflow|phân tích|write|build|create|make|fix|implement|develop|generate|draft|design|analyze|analyse|check|compare|match|verify|reconcile|khớp|đối chiếu|so sánh|so khớp|đối soát|\blàm\b/;

const WORK_ARTIFACT =
  /file|excel|xlsx|csv|email|gmail|outlook|inbox|folder|thư mục|dữ liệu|dataset|bảng|table|report|báo cáo|script|workflow|pdf|docx|json|patch|attachment|đính kèm|imap/;

const WORK_NEED =
  /cần|muốn|giúp|help|need|want|please|xin |hãy |xử lý|đối chiếu|so khớp|check|compare/;

/** Pure Q&A / explanation — not a work request (unless paired with artifacts + need). */
const ORDINARY_QA =
  /^(vì sao|tại sao|why\b|what is\b|what's\b|sao\s|how come\b|giải thích\s+(tại sao|vì sao)|làm sao\b|làm thế nào\b)/i;

const DOMAIN_SLOT_IDS = new Set(["source", "destination", "schedule", "scope", "existing"]);

/** Compare / reconcile style goals. */
export function isCompareLikeGoal(draft: string): boolean {
  return /check|compare|match|verify|reconcile|khớp|đối chiếu|so sánh|so khớp|đối soát/.test(draft.toLowerCase());
}

/**
 * Work intent: actionable deliverable / file / compare / automation work.
 * Not verb-only — artifacts + need phrases also count. Execute mode is always work.
 */
export function isActionableGoal(draft: string, executionMode: "analyze" | "execute" = "analyze"): boolean {
  if (executionMode === "execute") return true;
  const q = draft.toLowerCase().trim();
  if (!q) return false;
  if (ORDINARY_QA.test(q) && !(WORK_ARTIFACT.test(q) && WORK_NEED.test(q))) return false;
  if (isCompareLikeGoal(draft)) return true;
  if (WORK_ACTION.test(q)) return true;
  if (WORK_ARTIFACT.test(q) && WORK_NEED.test(q)) return true;
  return false;
}

/** Local template is too thin to skip Call A (e.g. only outcome/evidence). */
export function isShallowLocalInterview(questions: InterviewQuestion[]): boolean {
  if (!questions.length) return true;
  const domainHits = questions.filter(question => DOMAIN_SLOT_IDS.has(question.id)).length;
  if (domainHits >= 2) return false;
  return true;
}

/**
 * When the product does not already know a material business fact, ask the user in
 * interview form. Local templates first; shallow/miss → model interview (Call A).
 */
export function buildInterviewPlan(draft: string, executionMode: "analyze" | "execute", locale: AppLocale = "en"): InterviewPlan {
  const q = draft.toLowerCase();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  if (!isActionableGoal(draft, executionMode)) return { questions: [], source: "rule" };

  if (isCompareLikeGoal(draft)) {
    return { questions: [], source: "rule", needsModelInterview: true };
  }

  const questions: InterviewQuestion[] = [];
  const emailAutomation = /email|gmail|outlook|inbox|imap/.test(q) && /tự động|automation|workflow|lưu|save|lấy email|retrieve|forward/.test(q);
  const dataFlow =
    (/phân tích|analyze|analyse/.test(q) && /số liệu|csv|excel|xlsx|dữ liệu|dataset|statistics|thống kê|report|báo cáo/.test(q))
    || /thống kê|số liệu|csv|excel|xlsx|dữ liệu|dataset|statistics/.test(q);
  const hasPathOrFolder = /folder|thư mục|[a-z]:\\|onedrive|google drive|sharepoint/i.test(draft);
  const hasSchedule = /mỗi |hàng |khi có|theo giờ|ngày|tuần|bấm chạy|when i|daily|every day|on click|schedule/.test(q);
  const hasOutcome = /kết quả|deliverable|output|file |script|báo cáo|report|patch|json|csv|docx|pdf/.test(q);
  const hasEvidenceHint = /đính kèm|attach|file đính|theo file|based on|từ file|from the|nguồn:|source:/.test(q);

  if (emailAutomation && !/gmail|outlook|imap|email nguồn/.test(q)) {
    questions.push({ id: "source", label: t("qSourceLabel"), ask: t("qSourceAsk"), options: [t("optGmail"), t("optOutlook"), t("optWorkEmail")] });
  }
  if (emailAutomation && !hasPathOrFolder) {
    questions.push({ id: "destination", label: t("qDestLabel"), ask: t("qDestAsk"), options: [t("optLocalFolder"), t("optGDrive"), t("optOneDrive")] });
  }
  if (emailAutomation && !hasSchedule) {
    questions.push({ id: "schedule", label: t("qScheduleLabel"), ask: t("qScheduleAsk"), options: [t("optWhenIRun"), t("optWhenNewData"), t("optDaily")] });
  }
  if (emailAutomation && !/pdf|excel|xlsx|eml|đính kèm|nội dung|tiêu đề|subject|người gửi|toàn bộ email/.test(q)) {
    questions.push({ id: "scope", label: t("qScopeLabel"), ask: t("qScopeAsk"), options: [t("optWholeEmail"), t("optAttachmentsOnly"), t("optContentAndFiles")] });
  }
  if (executionMode === "execute" && !/được sửa|không sửa|ghi đè|tạo mới|giữ nguyên|overwrite|existing files|create new only/.test(q)) {
    questions.push({ id: "existing", label: t("qExistingLabel"), ask: t("qExistingAsk"), options: [t("optYes"), t("optNo")] });
  }
  if (dataFlow && !hasEvidenceHint) {
    questions.push({ id: "evidence", label: t("qEvidenceLabel"), ask: t("qEvidenceAsk"), options: [t("optEvidenceAttached"), t("optEvidencePaste"), t("optEvidenceDescribe")] });
  }
  if (!hasOutcome && (emailAutomation || dataFlow || executionMode === "execute")) {
    questions.push({ id: "outcome", label: t("qOutcomeLabel"), ask: t("qOutcomeAsk"), options: [t("optOutcomeAnalysis"), t("optOutcomeDoc"), t("optOutcomeScript"), t("optOutcomeOther")] });
  }

  const compact = questions.slice(0, 4);
  if (!compact.length || isShallowLocalInterview(compact)) {
    return { questions: compact, source: compact.length ? "dictionary" : "rule", needsModelInterview: true };
  }
  return { questions: compact, source: "dictionary" };
}

/** Offline / model-failure card so the user is never blocked without questions. */
export function localFallbackInterviewQuestions(locale: AppLocale = "en"): InterviewQuestion[] {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  return [
    { id: "outcome", label: t("qOutcomeLabel"), ask: t("qOutcomeAsk"), options: [t("optOutcomeAnalysis"), t("optOutcomeDoc"), t("optOutcomeScript"), t("optOutcomeOther")] },
    { id: "evidence", label: t("qEvidenceLabel"), ask: t("qEvidenceAsk"), options: [t("optEvidenceAttached"), t("optEvidencePaste"), t("optEvidenceDescribe")] },
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

/** Filled but still too vague to proceed with work. */
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
 * Call A system contract: elicit unknown business facts only.
 * Do not produce work products or prescribe a solution path.
 */
export const INTERVIEW_ONLY_RULE = [
  "MODE: INTERVIEW ONLY.",
  "Your only job is to elicit unknown business facts that materially change the outcome.",
  "Output ONLY valid JSON (no markdown fences, no prose):",
  '{"questions":[{"id":"short_id","label":"short label","ask":"Question ending with?","options":["A","B","C"],"multi":false}]}',
  "Rules:",
  "- 2 to 4 questions.",
  "- Each ask must end with ?.",
  "- Each question needs 2 to 4 short options. The UI also lets the user write a free description per question.",
  "- Ask business facts only (inputs, outputs, matching criteria, constraints, preferred approach if unknown).",
  "- Do not produce work products: no procedures, implementations, scripts, code, patches, reports, or prescribed solution paths.",
  "- Do not finish the user's task in this response.",
  "- Never ask the user to choose libraries, frameworks, APIs, architecture, folder layout, or test tools.",
  "- Match the language of the user goal.",
  "- If SEED QUESTIONS are provided, keep useful ones and add only missing material slots (do not duplicate).",
].join("\n");

export function buildInterviewOnlyPrompt(goal: string, locale: AppLocale, seed: InterviewQuestion[] = []): string {
  const lang = locale === "vi" ? "Vietnamese" : "the same language as the user goal";
  const seedBlock = seed.length
    ? `\n\nSEED QUESTIONS (keep if useful, add missing material slots only):\n${JSON.stringify({ questions: seed })}`
    : "";
  return `${INTERVIEW_ONLY_RULE}\nPreferred question language: ${lang}.\n\nUSER GOAL:\n${goal}${seedBlock}`;
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
  "Forbidden while UNKNOWN: inventing numbers, citations, names, destinations, schedules, file contents, business requirements, or user intent.",
  "Do not produce a deliverable, script, or completion claim that depends on an UNKNOWN fact.",
  "Prefer “I do not have that fact — please confirm:” over any guess.",
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
