import { translate, type AppLocale } from "./i18n.ts";

export type InterviewQuestion = { id: string; label: string; ask: string; options: string[]; multi?: boolean };
/** Local dictionary / rule interview only. Community never auto-calls a model for interviews. */
export type InterviewPlan = { questions: InterviewQuestion[]; source: "rule" | "dictionary" };

/** Local-first interview: no provider call is permitted while this function runs. */
export function buildInterviewPlan(draft: string, executionMode: "analyze" | "execute", locale: AppLocale = "en"): InterviewPlan {
  const q = draft.toLowerCase();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const actionable = /tạo|làm|sửa|xây|viết|chạy|tự động|automation|workflow|phân tích|write|build|create|make|fix|implement|develop|generate|draft|design|analyze|analyse/.test(q);
  if (!actionable) return { questions: [], source: "rule" };
  const questions: InterviewQuestion[] = [];
  const emailFlow = /email|gmail|outlook|inbox|imap/.test(q);
  if (emailFlow && !/gmail|outlook|imap|email nguồn/.test(q)) questions.push({ id: "source", label: t("qSourceLabel"), ask: t("qSourceAsk"), options: [t("optGmail"), t("optOutlook"), t("optWorkEmail"), t("optUnsure")] });
  if (emailFlow && (!/folder|thư mục/.test(q) || !/[a-z]:\\|onedrive|google drive|sharepoint/i.test(draft))) questions.push({ id: "destination", label: t("qDestLabel"), ask: t("qDestAsk"), options: [t("optLocalFolder"), t("optGDrive"), t("optOneDrive"), t("optUnsure")] });
  if (/tự động|automation|workflow|email|inbox/.test(q) && !/mỗi |hàng |khi có|theo giờ|ngày|tuần|bấm chạy/.test(q)) questions.push({ id: "schedule", label: t("qScheduleLabel"), ask: t("qScheduleAsk"), options: [t("optWhenIRun"), t("optWhenNewData"), t("optDaily"), t("optUnsure")] });
  if (emailFlow && !/pdf|excel|xlsx|eml|đính kèm|nội dung|tiêu đề|subject|người gửi|toàn bộ email/.test(q)) questions.push({ id: "scope", label: t("qScopeLabel"), ask: t("qScopeAsk"), options: [t("optWholeEmail"), t("optAttachmentsOnly"), t("optContentAndFiles"), t("optUnsure")] });
  if (executionMode === "execute" && !/được sửa|không sửa|ghi đè|tạo mới|giữ nguyên|overwrite|existing files|create new only/.test(q)) questions.push({ id: "existing", label: t("qExistingLabel"), ask: t("qExistingAsk"), options: [t("optYes"), t("optNo")] });
  const compact = questions.slice(0, 4);
  // Unfamiliar requests get no extra cards; Community never invents interview questions via a model.
  return { questions: compact, source: compact.length ? "dictionary" : "rule" };
}

/** Tables appear only after the first free-form send, never while the user is still typing. */
export function shouldOfferPostSendInterview(input: { composerSend: boolean; alreadyPending: boolean; questionCount: number }): boolean {
  return input.composerSend && !input.alreadyPending && input.questionCount > 0;
}
