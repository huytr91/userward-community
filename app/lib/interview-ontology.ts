import { translate, type AppLocale } from "./i18n.ts";
import type { InterviewQuestion } from "./interview-pipeline.ts";

/** Phase-1 intent families for work-scope interviews. */
export const INTENT_FAMILIES = [
  "build",
  "analyze",
  "transform",
  "compare",
  "automate",
  "write",
  "decide",
  "research",
] as const;

export type IntentFamily = (typeof INTENT_FAMILIES)[number];
export type DomainPackId = "coding" | "data" | "business_ops" | "general";

export type ClassifiedIntent = {
  family: IntentFamily | null;
  domain: DomainPackId;
  ordinary: boolean;
};

const ORDINARY_QA =
  /^(vì sao|tại sao|why\b|what is\b|what's\b|sao\s|how come\b|giải thích\s+(tại sao|vì sao)|làm sao\b|làm thế nào\b)/i;

const FAMILY_PATTERNS: Array<{ family: IntentFamily; pattern: RegExp }> = [
  { family: "compare", pattern: /check|compare|match|verify|reconcile|khớp|đối chiếu|so sánh|so khớp|đối soát/ },
  { family: "automate", pattern: /tự động|automation|workflow|schedule|mỗi ngày|hàng ngày|imap|outlook|gmail.*lưu|lấy email/ },
  { family: "transform", pattern: /chuyển|convert|transform|import|export|merge|join|chuẩn hóa|normalize|parse|extract|lọc|filter/ },
  { family: "analyze", pattern: /phân tích|analyze|analyse|thống kê|statistics|số liệu|dataset|dữ liệu|excel|xlsx|csv|báo cáo|report/ },
  { family: "build", pattern: /tạo|xây|build|create|make|implement|develop|app|ứng dụng|script|code|repo|website/ },
  { family: "write", pattern: /viết|write|draft|soạn|document|tài liệu|email body|nội dung/ },
  { family: "decide", pattern: /nên chọn|which should|decide|quyết định|ưu tiên|trade-?off|so sánh phương án/ },
  { family: "research", pattern: /nghiên cứu|research|tìm hiểu|survey|literature|trích dẫn|citation/ },
];

const DOMAIN_PATTERNS: Array<{ domain: DomainPackId; pattern: RegExp }> = [
  { domain: "data", pattern: /excel|xlsx|csv|tsv|số liệu|dataset|dữ liệu|bảng|table|thống kê|pivot/ },
  { domain: "coding", pattern: /code|script|repo|api|function|bug|typescript|python|patch|folder|thư mục|source/ },
  { domain: "business_ops", pattern: /email|gmail|outlook|inbox|workflow|automation|lưu file|one drive|google drive|schedule|hàng ngày/ },
];

export function classifyIntent(draft: string, executionMode: "analyze" | "execute" = "analyze"): ClassifiedIntent {
  const q = draft.toLowerCase().trim();
  if (!q) return { family: null, domain: "general", ordinary: true };
  if (ORDINARY_QA.test(q) && !/excel|xlsx|csv|email|file|folder|thư mục|automation|workflow/.test(q)) {
    return { family: null, domain: "general", ordinary: true };
  }
  let family: IntentFamily | null = null;
  for (const row of FAMILY_PATTERNS) {
    if (row.pattern.test(q)) {
      family = row.family;
      break;
    }
  }
  if (!family && executionMode === "execute") family = "build";
  if (!family && /cần|muốn|giúp|help|need|want|xử lý/.test(q) && /file|excel|email|dữ liệu|bảng/.test(q)) {
    family = "analyze";
  }
  let domain: DomainPackId = "general";
  for (const row of DOMAIN_PATTERNS) {
    if (row.pattern.test(q)) {
      domain = row.domain;
      break;
    }
  }
  return { family, domain, ordinary: !family };
}

type SlotDef = {
  id: string;
  labelKey: Parameters<typeof translate>[1];
  askKey: Parameters<typeof translate>[1];
  optionKeys: Array<Parameters<typeof translate>[1]>;
};

const OUTCOME: SlotDef = {
  id: "outcome",
  labelKey: "qOutcomeLabel",
  askKey: "qOutcomeAsk",
  optionKeys: ["optOutcomeAnalysis", "optOutcomeDoc", "optOutcomeScript", "optOutcomeOther"],
};

const EVIDENCE: SlotDef = {
  id: "evidence",
  labelKey: "qEvidenceLabel",
  askKey: "qEvidenceAsk",
  optionKeys: ["optEvidenceAttached", "optEvidencePaste", "optEvidenceDescribe"],
};

const DESTINATION: SlotDef = {
  id: "destination",
  labelKey: "qDestLabel",
  askKey: "qDestAsk",
  optionKeys: ["optLocalFolder", "optGDrive", "optOneDrive"],
};

const SCHEDULE: SlotDef = {
  id: "schedule",
  labelKey: "qScheduleLabel",
  askKey: "qScheduleAsk",
  optionKeys: ["optWhenIRun", "optWhenNewData", "optDaily"],
};

const SOURCE: SlotDef = {
  id: "source",
  labelKey: "qSourceLabel",
  askKey: "qSourceAsk",
  optionKeys: ["optGmail", "optOutlook", "optWorkEmail"],
};

const EXISTING: SlotDef = {
  id: "existing",
  labelKey: "qExistingLabel",
  askKey: "qExistingAsk",
  optionKeys: ["optYes", "optNo"],
};

const SCOPE: SlotDef = {
  id: "scope",
  labelKey: "qScopeLabel",
  askKey: "qScopeAsk",
  optionKeys: ["optWholeEmail", "optAttachmentsOnly", "optContentAndFiles"],
};

const MATCH_CRITERIA: SlotDef = {
  id: "match_criteria",
  labelKey: "qMatchCriteriaLabel",
  askKey: "qMatchCriteriaAsk",
  optionKeys: ["optMatchExact", "optMatchTolerance", "optMatchListDiff"],
};

const DATA_GRAIN: SlotDef = {
  id: "data_grain",
  labelKey: "qDataGrainLabel",
  askKey: "qDataGrainAsk",
  optionKeys: ["optGrainRow", "optGrainSummary", "optGrainBoth"],
};

const CODE_TARGET: SlotDef = {
  id: "code_target",
  labelKey: "qCodeTargetLabel",
  askKey: "qCodeTargetAsk",
  optionKeys: ["optCodePatch", "optCodeNewFile", "optCodeExplainOnly"],
};

function slotToQuestion(slot: SlotDef, locale: AppLocale): InterviewQuestion {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  return {
    id: slot.id,
    label: t(slot.labelKey),
    ask: t(slot.askKey),
    options: slot.optionKeys.map(key => t(key)),
  };
}

/** Domain packs: slots tailored to coding / data / business ops. */
export function domainPackSlots(input: {
  family: IntentFamily;
  domain: DomainPackId;
  draft: string;
  executionMode: "analyze" | "execute";
}): SlotDef[] {
  const q = input.draft.toLowerCase();
  const hasPath = /folder|thư mục|[a-z]:\\|onedrive|google drive|sharepoint/i.test(input.draft);
  const hasEvidence = /đính kèm|attach|file đính|theo file|based on|từ file|from the|nguồn:|source:/.test(q);
  const hasOutcome = /kết quả|deliverable|output|file |script|báo cáo|report|patch|json|csv|docx|pdf/.test(q);
  const hasSchedule = /mỗi |hàng |khi có|theo giờ|ngày|tuần|bấm chạy|when i|daily|every day|on click|schedule/.test(q);
  const slots: SlotDef[] = [];

  if (input.family === "compare" || (input.domain === "data" && /khớp|compare|check|đối chiếu/.test(q))) {
    slots.push(MATCH_CRITERIA);
    if (!hasEvidence) slots.push(EVIDENCE);
    if (!hasOutcome) slots.push(OUTCOME);
    return slots.slice(0, 4);
  }

  if (input.domain === "business_ops" || input.family === "automate") {
    if (/email|gmail|outlook|inbox|imap/.test(q) && !/gmail|outlook|imap|email nguồn/.test(q)) slots.push(SOURCE);
    if (!hasPath) slots.push(DESTINATION);
    if (!hasSchedule) slots.push(SCHEDULE);
    if (/email|gmail|outlook/.test(q) && !/pdf|excel|xlsx|eml|đính kèm|nội dung|tiêu đề|subject|người gửi|toàn bộ email/.test(q)) {
      slots.push(SCOPE);
    }
    if (!hasOutcome) slots.push(OUTCOME);
    return slots.slice(0, 4);
  }

  if (input.domain === "data" || input.family === "analyze" || input.family === "transform") {
    if (!hasEvidence) slots.push(EVIDENCE);
    slots.push(DATA_GRAIN);
    if (!hasOutcome) slots.push(OUTCOME);
    if (input.executionMode === "execute") slots.push(EXISTING);
    return slots.slice(0, 4);
  }

  if (input.domain === "coding" || input.family === "build") {
    slots.push(CODE_TARGET);
    if (input.executionMode === "execute") slots.push(EXISTING);
    if (!hasOutcome) slots.push(OUTCOME);
    if (!hasEvidence && /theo|based|từ file|attach|đính kèm/.test(q)) slots.push(EVIDENCE);
    return slots.slice(0, 4);
  }

  if (input.family === "write" || input.family === "research" || input.family === "decide") {
    if (!hasEvidence) slots.push(EVIDENCE);
    if (!hasOutcome) slots.push(OUTCOME);
    return slots.slice(0, 4);
  }

  if (input.executionMode === "execute") slots.push(EXISTING);
  if (!hasOutcome) slots.push(OUTCOME);
  if (!hasEvidence) slots.push(EVIDENCE);
  return slots.slice(0, 4);
}

export function buildOntologyInterviewQuestions(input: {
  draft: string;
  executionMode: "analyze" | "execute";
  locale: AppLocale;
  classified?: ClassifiedIntent;
}): InterviewQuestion[] {
  const classified = input.classified || classifyIntent(input.draft, input.executionMode);
  if (classified.ordinary || !classified.family) return [];
  const slots = domainPackSlots({
    family: classified.family,
    domain: classified.domain,
    draft: input.draft,
    executionMode: input.executionMode,
  });
  return slots.map(slot => slotToQuestion(slot, input.locale));
}

/** Domain slots that count as “rich” local coverage (not shallow). */
export const RICH_DOMAIN_SLOT_IDS = new Set([
  "source",
  "destination",
  "schedule",
  "scope",
  "existing",
  "match_criteria",
  "data_grain",
  "code_target",
]);
