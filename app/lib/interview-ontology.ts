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
/** Hard = side-effect / reconcile slots; soft = brief meta for open analysis. */
export type InterviewGate = "none" | "hard" | "soft";

export type ClassifiedIntent = {
  family: IntentFamily | null;
  domain: DomainPackId;
  ordinary: boolean;
  gate: InterviewGate;
};

const ORDINARY_QA =
  /^(vì sao|tại sao|why\b|what is\b|what's\b|sao\s|how come\b|giải thích\s+(tại sao|vì sao)|làm sao\b|làm thế nào\b)/i;

const FAMILY_PATTERNS: Array<{ family: IntentFamily; pattern: RegExp }> = [
  // Decide before compare so “so sánh phương án” is not treated as reconcile.
  { family: "decide", pattern: /nên chọn|which should|decide|quyết định|ưu tiên|trade-?off|so sánh phương án|compare options|which option/ },
  { family: "compare", pattern: /check|compare|match|verify|reconcile|khớp|đối chiếu|so sánh|so khớp|đối soát/ },
  // Automate needs ops cues — bare “outlook” / “schedule” must not steal market briefs.
  { family: "automate", pattern: /tự động|automation|workflow|mỗi ngày|hàng ngày|imap|lấy email|gmail.*lưu|outlook.*lưu|(email|gmail|outlook).*(lưu|save|folder|file)|(lưu|save).*(email|gmail|outlook)/ },
  { family: "transform", pattern: /chuyển đổi|convert|transform|import|export|merge|join|chuẩn hóa|normalize|parse|extract data|lọc dữ liệu|filter (rows|data|bảng)/ },
  { family: "analyze", pattern: /phân tích|analyze|analyse|thống kê|statistics|số liệu|dataset|dữ liệu|excel|xlsx|csv|báo cáo|report/ },
  { family: "build", pattern: /tạo|xây|build|create|make|implement|develop|app|ứng dụng|script|code|repo|website/ },
  { family: "write", pattern: /viết|write|draft|soạn|document|tài liệu|email body|viral|go-?to-?market|\bgtm\b|chiến lược|content (plan|strategy)|marketing plan|kế hoạch content|bài đăng|landing page/ },
  { family: "research", pattern: /nghiên cứu|research|tìm hiểu|survey|literature|trích dẫn|citation|thị trường|market|tin tức|news|outlook|xu hướng|triển vọng/ },
];

const DOMAIN_PATTERNS: Array<{ domain: DomainPackId; pattern: RegExp }> = [
  { domain: "data", pattern: /excel|xlsx|csv|tsv|số liệu|dataset|dữ liệu|bảng|table|thống kê|pivot/ },
  { domain: "coding", pattern: /code|script|repo|api|function|bug|typescript|python|patch|folder|thư mục|source/ },
  { domain: "business_ops", pattern: /email|gmail|outlook|inbox|workflow|automation|lưu file|one drive|google drive|schedule|hàng ngày/ },
];

const TABULAR_CUE = /excel|xlsx|csv|tsv|số liệu|dataset|dữ liệu|bảng|table|pivot|sheet/;

/** Go-to-market / viral / content strategy — needs project + channel, not market-news viewpoint. */
export function isGoToMarketLike(draft: string): boolean {
  return /viral|go-?to-?market|\bgtm\b|chiến lược|content (plan|strategy)|marketing|launch|ra mắt|growth|tiktok|instagram|facebook|linkedin|landing page|funnel|kế hoạch content|bài đăng/.test(draft.toLowerCase());
}

/** Gate from family/domain: hard stops side effects; soft clarifies open briefs. */
export function gateForIntent(family: IntentFamily | null, domain: DomainPackId, executionMode: "analyze" | "execute"): InterviewGate {
  if (!family) return "none";
  if (family === "automate" || family === "compare") return "hard";
  if (family === "build" || family === "transform") return "hard";
  if (domain === "business_ops" || domain === "coding" || domain === "data") return "hard";
  if (executionMode === "execute") return "hard";
  if (family === "research" || family === "write" || family === "decide") return "soft";
  if (family === "analyze") return "soft";
  return "soft";
}

export function classifyIntent(draft: string, executionMode: "analyze" | "execute" = "analyze"): ClassifiedIntent {
  const q = draft.toLowerCase().trim();
  if (!q) return { family: null, domain: "general", ordinary: true, gate: "none" };
  if (ORDINARY_QA.test(q) && !/excel|xlsx|csv|email|file|folder|thư mục|automation|workflow/.test(q)) {
    return { family: null, domain: "general", ordinary: true, gate: "none" };
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
  // Open-ended "analyze X" without tabular/ops cues → research brief pack.
  if (family === "analyze" && domain === "general" && !TABULAR_CUE.test(q)) {
    family = isGoToMarketLike(draft) ? "write" : "research";
  }
  if (!family && isGoToMarketLike(draft)) family = "write";
  const gate = gateForIntent(family, domain, executionMode);
  return { family, domain, ordinary: !family, gate };
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

const TIMEFRAME: SlotDef = {
  id: "timeframe",
  labelKey: "qTimeframeLabel",
  askKey: "qTimeframeAsk",
  optionKeys: ["optTimeNearTerm", "optTimeMonth", "optTimeQuarter", "optTimeOpen"],
};

const OUTPUT_SHAPE: SlotDef = {
  id: "output_shape",
  labelKey: "qOutputShapeLabel",
  askKey: "qOutputShapeAsk",
  optionKeys: ["optOutSummary", "optOutRiskChecklist", "optOutArgumentFrame", "optOutFullWriteup"],
};

const AUDIENCE: SlotDef = {
  id: "audience",
  labelKey: "qViewpointLabel",
  askKey: "qViewpointAsk",
  optionKeys: ["optAudPersonal", "optAudMacro", "optAudNewsOnly", "optAudTeam"],
};

const CONSTRAINTS: SlotDef = {
  id: "constraints",
  labelKey: "qConstraintsLabel",
  askKey: "qConstraintsAsk",
  optionKeys: ["optConPublishedOnly", "optConNoForecast", "optConLabelGuesses", "optConNoSpecial"],
};

const OBJECTIVE: SlotDef = {
  id: "objective",
  labelKey: "qObjectiveLabel",
  askKey: "qObjectiveAsk",
  optionKeys: ["optObjProduct", "optObjService", "optObjPersonalBrand", "optObjOther"],
};

const CHANNEL: SlotDef = {
  id: "channel",
  labelKey: "qChannelLabel",
  askKey: "qChannelAsk",
  optionKeys: ["optChSocial", "optChBlog", "optChEmail", "optChMulti"],
};

const WRITE_AUDIENCE: SlotDef = {
  id: "audience",
  labelKey: "qWriteAudienceLabel",
  askKey: "qWriteAudienceAsk",
  optionKeys: ["optWriteAudCustomer", "optWriteAudProspect", "optWriteAudInternal", "optWriteAudPublic"],
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

/** Meta slots allowed for Call A (never domain knowledge quizzes). */
export const META_SLOT_IDS = new Set([
  "timeframe",
  "output_shape",
  "audience",
  "constraints",
  "outcome",
  "evidence",
  "destination",
  "schedule",
  "source",
  "scope",
  "existing",
  "match_criteria",
  "data_grain",
  "code_target",
  "objective",
  "channel",
]);

/** Domain packs: slots tailored to coding / data / business ops / research brief. */
export function domainPackSlots(input: {
  family: IntentFamily;
  domain: DomainPackId;
  draft: string;
  executionMode: "analyze" | "execute";
}): SlotDef[] {
  const q = input.draft.toLowerCase();
  const hasPath = /folder|thư mục|[a-z]:\\|onedrive|google drive|sharepoint/i.test(input.draft);
  const hasEvidence = /đính kèm|attach|file đính|theo file|based on|từ file|from the|nguồn:|source:/.test(q);
  const hasOutcome = /kết quả|deliverable|\boutput\b|script|báo cáo|\breport\b|patch|\.json|\.csv|\.docx|\.pdf|tạo file|create file|write file|xuất file/.test(q);
  const hasSchedule = /mỗi |hàng |khi có|theo giờ|ngày|tuần|bấm chạy|when i|daily|every day|on click|schedule/.test(q);
  const hasTimeframe = /tuần|tháng|quý|năm|this week|next month|this quarter|near term|sắp tới|tới đây/.test(q);
  const hasObjective = /(sản phẩm|product|dự án|project|brand|thương hiệu|dịch vụ|service)\s+\S+/.test(q) || /cho\s+(app|ứng dụng|sản phẩm|product)\b/.test(q);
  const hasChannel = /tiktok|instagram|facebook|linkedin|email|blog|landing|youtube|zalo/.test(q);
  const slots: SlotDef[] = [];

  if (input.family === "compare" || (input.domain === "data" && /khớp|compare|check|đối chiếu/.test(q))) {
    slots.push(MATCH_CRITERIA);
    if (!hasEvidence) slots.push(EVIDENCE);
    if (!hasOutcome) slots.push(OUTCOME);
    return slots.slice(0, 4);
  }

  if (input.domain === "business_ops" || input.family === "automate") {
    // Ask source when mail is involved but no provider is named yet.
    if (/email|inbox|mail/.test(q) && !/\b(gmail|outlook|imap)\b/.test(q)) slots.push(SOURCE);
    if (!hasPath) slots.push(DESTINATION);
    if (!hasSchedule) slots.push(SCHEDULE);
    if (/email|gmail|outlook|inbox|imap/.test(q) && !/pdf|excel|xlsx|eml|đính kèm|nội dung|tiêu đề|subject|người gửi|toàn bộ email/.test(q)) {
      slots.push(SCOPE);
    }
    if (!hasOutcome) slots.push(OUTCOME);
    return slots.slice(0, 4);
  }

  if (input.domain === "data" || ((input.family === "analyze" || input.family === "transform") && TABULAR_CUE.test(q))) {
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

  // Write / GTM / viral: project + channel block CLEAR before a useful draft.
  if (input.family === "write" || isGoToMarketLike(input.draft)) {
    if (!hasObjective) slots.push(OBJECTIVE);
    if (!hasChannel) slots.push(CHANNEL);
    slots.push(WRITE_AUDIENCE);
    slots.push(OUTPUT_SHAPE);
    return slots.slice(0, 4);
  }

  if (input.family === "research" || input.family === "decide" || input.family === "analyze") {
    if (!hasTimeframe) slots.push(TIMEFRAME);
    slots.push(OUTPUT_SHAPE);
    slots.push(AUDIENCE);
    slots.push(CONSTRAINTS);
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

/** Slots that count as rich local coverage (not shallow). */
export const RICH_DOMAIN_SLOT_IDS = new Set([
  "source",
  "destination",
  "schedule",
  "scope",
  "existing",
  "match_criteria",
  "data_grain",
  "code_target",
  "timeframe",
  "output_shape",
  "audience",
  "constraints",
  "objective",
  "channel",
]);

/** Side-effect / reconcile slots — hard gate must keep interviewing if Call A fails. */
export const HARD_SLOT_IDS = new Set([
  "destination",
  "schedule",
  "source",
  "match_criteria",
  "existing",
  "code_target",
  "scope",
]);
