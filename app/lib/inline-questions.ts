import type { Translator } from "./i18n.ts";

export type InlineQuestion = { id: string; ask: string; options: string[]; multi: boolean };

const HOWTO_START = /^(mở|open|trong |thêm |tìm |cấu hình|nhấn|bấm|lưu|save|click|visit|go to|navigate|cài|install|đăng nhập|sign in|create\s*→|chọn create|tạo flow|sau trigger)/i;

function stripDecor(line: string) {
  return line.replace(/\*\*/g, "").replace(/^#+\s*/, "");
}

function isHowToAsk(ask: string) {
  const head = ask.replace(/^\*\*/, "").trim();
  if (/\?/.test(head)) return false;
  return HOWTO_START.test(head);
}

function isClarifyingAsk(ask: string) {
  if (isHowToAsk(ask)) return false;
  const head = ask.trim();
  if (/\?\s*$/.test(head) || /\?\s*[—–-]/i.test(head)) return true;
  return /^(where|what|which|who|when|how many|do you|should |asset\/market|holding period|bạn muốn|nên dùng|chọn cái nào)/i.test(head);
}

function isChoiceOption(text: string) {
  const value = text.trim();
  if (value.length < 1 || value.length > 88) return false;
  if (/https?:\/\//i.test(value)) return false;
  if (HOWTO_START.test(value)) return false;
  return true;
}

function optionsFromExamples(ask: string) {
  const match = ask.match(/\be\.g\.[:\s,]*([^.?\n]+)\??\s*$/i) || ask.match(/ví dụ[:\s]*([^.?\n]+)\??/i);
  if (!match) return [];
  return match[1].split(/\s*(?:,|\/|;| hoặc | or )\s*/).map(item => item.replace(/^and\s+/i, "").trim()).filter(isChoiceOption);
}

/** Choice cards only for clarifying questions. Numbered HOWTO steps stay as prose. */
export function parseInlineQuestions(text: string, t: Translator): InlineQuestion[] {
  const withoutHands = text.replace(/```uw-hands[\s\S]*?```/gi, "");
  const lines = withoutHands.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const questions: InlineQuestion[] = [];
  let current: InlineQuestion | null = null;
  for (const raw of lines) {
    const line = stripDecor(raw);
    const question = line.match(/^(\d+)[.)]\s*(.+?)(?:\s*[—–-]\s*)?$/);
    const option = line.match(/^(?:(?:[-–•]\s*)(?:[a-zA-Z][.)]|\[[ xX]?\]|☐|○)\s*|[-–•]\s+)(.+)$/);
    if (question) {
      const ask = question[2].trim();
      current = { id: `q${question[1]}`, ask, options: optionsFromExamples(ask), multi: /chọn nhiều|multiple|select all|có thể chọn nhiều/i.test(ask) };
      questions.push(current);
    } else if (current && option) {
      const value = option[1].trim();
      const inlineOptions = value.split(/\s+[·|]\s+/).map(item => item.trim()).filter(Boolean);
      current.options.push(...(inlineOptions.length > 1 ? inlineOptions : [value]).filter(isChoiceOption));
    }
  }
  const technicalQuestion = /kiến trúc|architecture|cấu trúc thư mục|folder structure|mã nguồn|source code|thư viện|library|framework|api nào|which api|test tool|công cụ test|database|cơ sở dữ liệu|platform|ngôn ngữ nào|which language|which stack|robin|power automate desktop/i;
  const clarifying = questions.filter(question => isClarifyingAsk(question.ask) && !technicalQuestion.test(question.ask));
  for (const question of clarifying) {
    if (!question.options.length) {
      question.options = /tool|công cụ|tính năng|feature|component/i.test(question.ask)
        ? [t("yesUseAi"), t("noNeedFeature"), t("unsureLetAi")]
        : [t("useAiOption"), t("noSpecialReq"), t("unsureLetAiPick")];
    } else if (question.options.length === 1) question.options.push(t("noSpecialReq"), t("letAiPickFit"));
  }
  return clarifying.length >= 2 && clarifying.some(question => question.options.length >= 2) ? clarifying : [];
}
