"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { assessPolicyRisk } from "./lib/policy-rag";
import { detectLocale, localeNames, supportedLocales, translate, type AppLocale, type TranslationKey, type TranslateVars, type Translator } from "./lib/i18n";
import { compileContextPack, createExecutionReceipt, createGoalContract, routeForUser, USER_INTEREST_CONSTITUTION, type ExecutionReceipt } from "./lib/userward-core";
import { buildRecentConversation, chunkText, estimateTurnUsage, parsePendingPatch, sumConversationUsage, type SafePendingPatch } from "./lib/chat-contract";
import { inferModelCapability, type ModelCapability } from "./lib/model-capabilities";
import { extractOfficeText, OFFICE_FILE, TEXT_FILE } from "./lib/file-extraction";
import { buildInterviewPlan, shouldOfferPostSendInterview } from "./lib/interview-pipeline";
import { measureContextPackSavings, type PromptSavings } from "./lib/prompt-pack";
import { policyResultWarning, openRouterPrivacyAssistantText } from "./lib/safety-experience";
import { isOpenRouterPrivacyRestriction, PROVIDER_TOTAL_TIMEOUT_MS, STREAM_IDLE_TIMEOUT_MS } from "./lib/provider-connect-errors";
import { parseInlineQuestions, type InlineQuestion } from "./lib/inline-questions";
import { inferHandIntent, looksLikeHandGoal, parseHandsBlock, runBrowserHand, stripHandsFence } from "./lib/hands";
import { composerRunDisabled, executeNeedsConnectedFolder } from "./lib/send-guards";

type Kind = "message" | "task" | "decision" | "result" | "file";
type TokenUsage = { promptTokens: number; completionTokens: number; totalTokens: number; cost?: number };
type Entry = { id: string; kind: Kind; title?: string; text: string; time: string; meta?: string; role?: "user" | "ai"; usage?: TokenUsage; receipt?: ExecutionReceipt; notice?: string };
type Attachment = { name: string; size: number; text?: string; dataUrl?: string; mime?: string };
type LocalProject = { id: string; name: string; kind?: "chat" | "project"; folderName?: string; group?: "active" | "archive"; entries: Entry[] };
type WorkspaceFile = { path: string; handle: FileSystemFileHandle };
type PendingPatch = SafePendingPatch;
type InterviewQuestion = { id: string; label: string; ask: string; options: string[]; multi?: boolean };
type PendingInterview = { entryId: string; goal: string; questions: InterviewQuestion[] };
type CapabilityAssessment = { level: "supported" | "partial" | "unsupported"; title: string; canDo: string; cannotDo?: string; needs?: string };
type ProductEdition = "personal" | "community";
type FriendlyFailure = { title: string; message: string; action: string; meta: string };
const PRODUCT_EDITION: ProductEdition = import.meta.env.VITE_MINIMUM_EDITION === "community" ? "community" : "personal";

const folderStore = {
  open: () => new Promise<IDBDatabase>((resolve,reject)=>{ const request=indexedDB.open("minimum-workspace",1); request.onupgradeneeded=()=>request.result.createObjectStore("folders"); request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error); }),
  get: async (projectId:string) => { const db=await folderStore.open(); return await new Promise<FileSystemDirectoryHandle|null>((resolve,reject)=>{ const request=db.transaction("folders").objectStore("folders").get(projectId); request.onsuccess=()=>resolve(request.result||null); request.onerror=()=>reject(request.error); }); },
  set: async (projectId:string,handle:FileSystemDirectoryHandle) => { const db=await folderStore.open(); await new Promise<void>((resolve,reject)=>{ const request=db.transaction("folders","readwrite").objectStore("folders").put(handle,projectId); request.onsuccess=()=>resolve(); request.onerror=()=>reject(request.error); }); },
  delete: async (projectId:string) => { const db=await folderStore.open(); await new Promise<void>((resolve,reject)=>{ const request=db.transaction("folders","readwrite").objectStore("folders").delete(projectId); request.onsuccess=()=>resolve(); request.onerror=()=>reject(request.error); }); },
};

const initialEntries: Entry[] = [
  { id: "security-policy", kind: "decision", title: "Security baseline", text: "Local-first, quyền tối thiểu, tự động che secret trước khi gửi provider và mọi thay đổi file đều cần user xác nhận.", time: "Hôm nay", meta: "Bảo mật · Đã ghim" },
];

const seedProjects: LocalProject[] = [
  { id: "pdf", name: "PDF Converter", entries: initialEntries.filter(entry => entry.id === "security-policy") },
  { id: "finance", name: "Financial Analyzer", entries: [] },
  { id: "automation", name: "Automation Tool", entries: [] },
];
function getProviderGuides(t: Translator): Record<string, { keyUrl: string; billingUrl: string; keyLabel?: string; note: string }> {
  return {
    OpenRouter: { keyUrl: "https://openrouter.ai/keys", billingUrl: "https://openrouter.ai/settings/credits", keyLabel: t("createApiKey"), note: t("openRouterNote") },
    OpenAI: { keyUrl: "https://platform.openai.com/api-keys", billingUrl: "https://platform.openai.com/settings/organization/billing/overview", note: t("openaiNote") },
    Anthropic: { keyUrl: "https://console.anthropic.com/settings/keys", billingUrl: "https://console.anthropic.com/settings/billing", note: t("anthropicNote") },
    Google: { keyUrl: "https://aistudio.google.com/app/apikey", billingUrl: "https://console.cloud.google.com/billing", note: t("googleNote") },
    DeepSeek: { keyUrl: "https://platform.deepseek.com/api_keys", billingUrl: "https://platform.deepseek.com/top_up", note: t("deepseekNote") },
    Qwen: { keyUrl: "https://modelstudio.console.alibabacloud.com/?tab=dashboard#/api-key", billingUrl: "https://billing-cost.console.alibabacloud.com/", note: t("qwenNote") },
    Kimi: { keyUrl: "https://platform.moonshot.ai/console/api-keys", billingUrl: "https://platform.moonshot.ai/console/info", note: t("kimiNote") },
  };
}
function localizeKnownTime(time: string, t: Translator) {
  if (time === "Vừa xong" || time === "Just now") return t("justNow");
  if (time === "Hôm nay" || time === "Today") return t("today");
  if (time === "Đang trả lời…" || time === "Answering…") return t("answering");
  return time;
}
function ReceiptLine({ receipt, t, locale }: { receipt: ExecutionReceipt; t: Translator; locale: AppLocale }) {
  const numberLocale = locale === "vi" ? "vi-VN" : locale;
  return <details className="execution-receipt receipt-line">
    <summary><span>✓ {receipt.status === "preview" ? t("receiptPreview") : t("receiptChecked")}</span><small>{receipt.usage ? `${receipt.usage.totalTokens.toLocaleString(numberLocale)} token` : t("viewEvidence")}</small></summary>
    <div className="receipt-grid"><section><b>AI</b><span>{receipt.model}</span><span>{receipt.tools.join(" · ")}</span></section><section><b>Data sent</b>{receipt.dataSent.map(item=><span key={item}>{item}</span>)}</section><section><b>Evidence</b>{receipt.evidence.map(item=><span key={item}>{item}</span>)}{!receipt.evidence.length&&<span>—</span>}</section><section><b>Cost</b><span>{receipt.usage?`${receipt.usage.totalTokens.toLocaleString(numberLocale)} token${receipt.usage.cost?` · $${receipt.usage.cost.toFixed(4)}`:""}`:"—"}</span><span>{receipt.changes.length?receipt.changes.join(" · "):"—"}</span></section></div>
  </details>;
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    brain: <><path d="M9.5 4.5A3 3 0 0 0 5 7a3.5 3.5 0 0 0 .5 6.96A3 3 0 0 0 9 18.5V5.2M14.5 4.5A3 3 0 0 1 19 7a3.5 3.5 0 0 1-.5 6.96A3 3 0 0 1 15 18.5V5.2M9 9h3M12 14h3"/></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    command: <><path d="M9 6V5a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v14a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3Z"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

class ProviderRequestError extends Error {
  failure: FriendlyFailure;
  constructor(failure: FriendlyFailure) {
    super(`${failure.message} ${failure.action}`.trim());
    this.failure = failure;
  }
}

function explainProviderFailure(status: number, providerName: string, message = "", t: Translator): FriendlyFailure {
  const normalized = message.toLowerCase();
  if (status === 401 || /invalid api key|user not found|key.*(?:invalid|expired|revoked)|api key.*(?:không hợp lệ|hết hạn)/i.test(message)) return { title: t("reconnectAi"), message: t("keyUnusable", { provider: providerName }), action: t("openConnectValid"), meta: t("connectMeta", { provider: providerName }) };
  if (isOpenRouterPrivacyRestriction(message)) return { title: t("openRouterPrivacyTitle"), message: t("openRouterPrivacyMessage"), action: t("openRouterPrivacyAction"), meta: t("openRouterPrivacyMeta") };
  if (status === 402 || /insufficient|credit|balance|payment required|at least \$|không đủ.*(?:credit|số dư)/i.test(message)) return { title: t("insufficientBalance"), message: t("needsMoreCredit", { provider: providerName }), action: t("addCreditOrCheaper"), meta: t("balanceMeta", { provider: providerName }) };
  if (status === 429 && /free|quota|limit|lượt|hạn mức/i.test(message)) return { title: t("freeQuotaGone"), message: t("freeQuotaUsed", { provider: providerName }), action: t("waitOrSwitchNoUpgrade"), meta: t("quotaMeta", { provider: providerName }) };
  if (status === 429) return { title: t("tooManyRequests"), message: t("rateLimited", { provider: providerName }), action: t("waitAndResend"), meta: t("busyMeta", { provider: providerName }) };
  if (/finish:\s*length|dùng hết giới hạn|output.*limit|maximum.*token/.test(normalized)) return { title: t("answerOverLimit"), message: t("modelHitLimit"), action: t("retryShorter"), meta: t("limitMeta", { provider: providerName }) };
  if (status === 408 || status === 504 || /timeout|quá lâu/.test(normalized)) return { title: t("aiTooSlow"), message: t("providerTimeout", { provider: providerName }), action: t("resendOrSwitchNoRetry"), meta: t("timeoutMeta", { provider: providerName }) };
  if (status === 503 || /ollama_not_running|econnrefused|connection refused|11434|ollama (?:chưa chạy|is not running)/i.test(message) || (/không thể kết nối/.test(normalized) && /ollama/i.test(providerName))) {
    if (/ollama/i.test(providerName) || /11434|ollama/i.test(message)) return { title: t("ollamaNotRunningTitle"), message: t("ollamaNotRunning"), action: t("startOllamaThenRetry"), meta: t("ollamaNotRunningMeta") };
    return { title: t("providerUnreachableTitle"), message: t("providerUnreachable", { provider: providerName }), action: t("checkNetworkOrLocal"), meta: t("providerUnreachableMeta", { provider: providerName }) };
  }
  if (status === 422 && /ollama/i.test(providerName) && /ollama_no_models|chưa có model|no models/i.test(message)) return { title: t("ollamaNoModelsTitle"), message: t("ollamaNoModels"), action: t("installOllamaModel"), meta: t("ollamaNoModelsMeta") };
  if (status >= 500 || /internal server error|dịch vụ tạm thời/.test(normalized)) return { title: t("aiInterrupted"), message: t("providerUnstable", { provider: providerName }), action: t("retryOrSwitch"), meta: t("downMeta", { provider: providerName }) };
  return { title: t("aiIncomplete"), message: message || t("providerNoResult", { provider: providerName }), action: t("retryOrSwitchModel"), meta: t("incompleteMeta", { provider: providerName }) };
}

function explainClientFailure(error: unknown, t: Translator): FriendlyFailure {
  const message = error instanceof Error ? error.message : String(error || "");
  if (isOpenRouterPrivacyRestriction(message)) {
    return { title: t("openRouterPrivacyTitle"), message: t("openRouterPrivacyMessage"), action: t("openRouterPrivacyAction"), meta: t("openRouterPrivacyMeta") };
  }
  if (error instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(message)) {
    return {
      title: t("lostLocal"),
      message: t("noLocalResponse"),
      action: t("checkStartWindow"),
      meta: t("localInterrupt"),
    };
  }
  return {
    title: t("userwardIncomplete"),
    message: message || t("noResultReceived"),
    action: t("retryOrChangeModel"),
    meta: t("userwardIncompleteMeta"),
  };
}

async function readStreamLine(reader: ReadableStreamDefaultReader<Uint8Array>, idleMs: number) {
  let timer = 0;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" })), idleMs);
      }),
    ]);
  } finally {
    window.clearTimeout(timer);
  }
}

async function readProviderJson(response: Response, providerName: string, t: Translator, onDelta?: (text: string) => void) {
  if (response.ok && response.headers.get("content-type")?.includes("application/x-ndjson")) {
    const reader = response.body?.getReader();
    if (!reader) throw new ProviderRequestError(explainProviderFailure(502, providerName, t("emptyStream"), t));
    const decoder = new TextDecoder(); let buffer = ""; let text = ""; let selectedModel = ""; let usage: TokenUsage | undefined;
    const deadline = Date.now() + PROVIDER_TOTAL_TIMEOUT_MS + 5_000;
    let sawStarted = false;
    while (true) {
      const remainingTotal = deadline - Date.now();
      if (remainingTotal <= 0) throw new ProviderRequestError(explainProviderFailure(504, providerName, "timeout", t));
      let done = false;
      let value: Uint8Array | undefined;
      try {
        ({ done, value } = await readStreamLine(reader, Math.min(STREAM_IDLE_TIMEOUT_MS, remainingTotal)));
      } catch (error) {
        if (error instanceof Error && error.name === "TimeoutError") {
          throw new ProviderRequestError(explainProviderFailure(504, providerName, "timeout", t));
        }
        throw error;
      }
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/); buffer = lines.pop() || "";
      for (const line of lines) if (line.trim()) {
        let event: {delta?:string;selectedModel?:string;error?:string;code?:string;started?:boolean;usage?:TokenUsage};
        try { event = JSON.parse(line) as {delta?:string;selectedModel?:string;error?:string;code?:string;started?:boolean;usage?:TokenUsage}; }
        catch { continue; }
        if (event.started) { sawStarted = true; if (event.selectedModel) selectedModel = event.selectedModel; continue; }
        if(event.error) {
          const streamError = [event.code, event.error].filter(Boolean).join(" ");
          if (isOpenRouterPrivacyRestriction(streamError)) return { text: openRouterPrivacyAssistantText(t), selectedModel, usage: undefined as TokenUsage | undefined };
          throw new ProviderRequestError(explainProviderFailure(504, providerName, streamError, t));
        }
        if(event.usage && event.usage.totalTokens) usage = event.usage;
        if(event.delta){text+=event.delta;onDelta?.(text);}
        if(event.selectedModel)selectedModel=event.selectedModel;
      }
      if (done) break;
    }
    if (!text.trim() && !sawStarted) throw new ProviderRequestError(explainProviderFailure(502, providerName, t("emptyStream"), t));
    if (!text.trim()) throw new ProviderRequestError(explainProviderFailure(502, providerName, t("noFinalContent"), t));
    return { text, selectedModel, usage };
  }
  const raw = await response.text();
  let data: { error?: string; code?: string; text?: string; selectedModel?: string; usage?: TokenUsage; warning?: string } = {};
  try { data = raw ? JSON.parse(raw) : {}; }
  catch {
    throw new ProviderRequestError(explainProviderFailure(response.status || 502, providerName, raw, t));
  }
  const providerErrorText = [data.code, data.error].filter(Boolean).join(" ");
  if (data.code === "openrouter_privacy" || data.warning === "openrouter_privacy" || (!response.ok && isOpenRouterPrivacyRestriction(providerErrorText))) {
    return { text: openRouterPrivacyAssistantText(t), selectedModel: data.selectedModel, usage: undefined };
  }
  if (!response.ok) throw new ProviderRequestError(explainProviderFailure(response.status, providerName, providerErrorText, t));
  if (typeof data.text !== "string" || !data.text.trim()) throw new ProviderRequestError(explainProviderFailure(502, providerName, t("noFinalContent"), t));
  return { ...data, text: data.text };
}

function highlight(text: string, query: string) {
  if (!query.trim()) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return parts.map((part, i) => part.toLowerCase() === query.toLowerCase() ? <mark key={i}>{part}</mark> : part);
}

function buildUsagePlan(input: string, t: Translator) {
  const q = input.toLowerCase();
  const research = /nghiên cứu|bài báo|luận văn|số liệu|thống kê|citation|trích dẫn/.test(q);
  const coding = /code|bug|lỗi|repo|function|api|script/.test(q);
  const finance = /tài chính|đầu tư|cổ phiếu|doanh thu|lợi nhuận/.test(q);
  const legal = /pháp lý|luật|hợp đồng|điều khoản/.test(q);
  if (research) return { profile: "Research", risk: t("riskHigh"), priority: t("researchPriority"), tool: /số liệu|thống kê|phân tích/.test(q) ? t("researchToolData") : t("researchToolSearch"), verification: t("verificationHigh"), source: t("researchSource"), inference: t("researchInference"), output: t("researchOutput") };
  if (coding) return { profile: "Coding", risk: t("riskMedium"), priority: t("codingPriority"), tool: t("codingTool"), verification: t("verificationTest"), source: t("codingSource"), inference: t("codingInference"), output: t("codingOutput") };
  if (finance || legal) return { profile: finance ? "Finance" : "Legal", risk: t("riskHigh"), priority: t("financePriority"), tool: t("financeTool"), verification: t("verificationHigh"), source: t("financeSource"), inference: t("financeInference"), output: t("financeOutput") };
  return { profile: "General Work", risk: t("riskLow"), priority: t("generalPriority"), tool: t("generalTool"), verification: t("verificationStandard"), source: t("generalSource"), inference: t("generalInference"), output: t("generalOutput") };
}

function assessCapabilities(input: string, executionMode: "analyze" | "execute", hasFolder: boolean, t: Translator, edition: ProductEdition = PRODUCT_EDITION): CapabilityAssessment {
  const q = input.toLowerCase().trim();
  const codingArtifact = /(?:tool|công cụ|script|code|app|ứng dụng|phần mềm|website|api|pipeline|workflow|thư viện|package|python|javascript|typescript|react|node|ffmpeg|remotion).{0,40}(?:video|audio|ảnh|image|pdf|docx|xlsx|pptx)|(?:tạo|viết|xây|làm).{0,20}(?:tool|công cụ|script|code|app|ứng dụng|phần mềm|website|api|pipeline|workflow)/i.test(q);
  const directVideo = !codingArtifact && (/(?:tạo|xuất|render|làm).{0,20}(?:mp4|video)|(?:mp4|video).{0,20}(?:trực tiếp|hoàn chỉnh|thành phẩm)/i.test(q)) && !/script|kịch bản|storyboard|shot list|lời thoại/i.test(q);
  const directAudio = !codingArtifact && /(?:tạo|xuất|render).{0,20}(?:mp3|wav|audio|giọng nói|voiceover)/i.test(q);
  const directImage = !codingArtifact && /(?:tạo|generate|vẽ).{0,20}(?:ảnh|hình ảnh|png|jpg|logo)/i.test(q);
  const officeBinary = !codingArtifact && /(?:tạo|xuất).{0,20}(?:docx|xlsx|pptx|powerpoint|file pdf)/i.test(q);
  const externalAction = /(?:gửi|send).{0,20}(?:email|gmail|tin nhắn)|(?:đăng|publish|upload).{0,20}(?:web|youtube|facebook|tiktok)|đặt lịch|chuyển tiền/i.test(q);
  const runAction = /(?:chạy|execute|cài đặt|deploy).{0,20}(?:code|script|app|website|server)/i.test(q);
  const communityOutOfScope = directVideo || directAudio || directImage || officeBinary || externalAction;
  if (codingArtifact) return { level: executionMode === "execute" && hasFolder ? "supported" : "partial", title: executionMode === "execute" && hasFolder ? t("capCanPerform") : t("capPartial"), canDo: executionMode === "execute" && hasFolder ? t("capWriteCode") : t("capPrepareCode"), cannotDo: executionMode === "execute" && hasFolder ? undefined : t("capNeedFolderAccess"), needs: executionMode === "execute" && hasFolder ? undefined : t("capChooseProjectWork") };
  if (edition === "community" && communityOutOfScope) return { level: "unsupported", title: t("capCommunityTitle"), canDo: t("capCommunityCan"), cannotDo: t("capCommunityCannot"), needs: t("capCommunityNeeds") };
  if (directVideo) return { level: "unsupported", title: t("capNoVideo"), canDo: t("capVideoCan"), cannotDo: t("capVideoCannot"), needs: t("capVideoNeeds") };
  if (directAudio) return { level: "unsupported", title: t("capNoAudio"), canDo: t("capAudioCan"), cannotDo: t("capAudioCannot"), needs: t("capAudioNeeds") };
  if (directImage) return { level: "unsupported", title: t("capNoImage"), canDo: t("capImageCan"), cannotDo: t("capImageCannot"), needs: t("capImageNeeds") };
  if (officeBinary) return { level: "partial", title: t("capSourceOnly"), canDo: t("capOfficeCan"), cannotDo: t("capOfficeCannot"), needs: t("capOfficeNeeds") };
  if (externalAction) return { level: "unsupported", title: t("capNoExternal"), canDo: t("capExternalCan"), cannotDo: t("capExternalCannot"), needs: t("capExternalNeeds") };
  if (runAction) return { level: "partial", title: t("capPrepareNotRun"), canDo: executionMode === "execute" && hasFolder ? t("capRunCanFolder") : t("capRunCanAnalyze"), cannotDo: t("capRunCannot"), needs: t("capRunNeeds") };
  if (executionMode === "execute" && !hasFolder) return { level: "partial", title: t("capNeedFolderTitle"), canDo: t("capNeedFolderCan"), cannotDo: t("capNeedFolderCannot"), needs: t("capNeedFolderNeeds") };
  return { level: "supported", title: t("capSupportedTitle"), canDo: executionMode === "execute" ? t("capSupportedExecute") : t("capSupportedAnalyze") };
}

function capabilityHeading(level: CapabilityAssessment["level"], t: Translator) {
  if (level === "supported") return t("capCanPerform");
  if (level === "partial") return t("capPartial");
  return t("capCannotFully");
}

const assessLegalRisk = assessPolicyRisk;

function redactSecrets(input: string) {
  const patterns = [
    /sk-(?:or-v1-|ant-|proj-)?[A-Za-z0-9_-]{16,}/g,
    /AIza[0-9A-Za-z_-]{30,}/g,
    /gh[opusr]_[A-Za-z0-9]{20,}/g,
    /(?:Bearer\s+)[A-Za-z0-9._-]{16,}/gi,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    /((?:password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*)[^\s"']+/gi,
  ];
  let text = input; let count = 0;
  for (const pattern of patterns) text = text.replace(pattern, match => { count += 1; const prefix = match.match(/^[^:=]+[:=]\s*/)?.[0] || ""; return `${prefix}[REDACTED_SECRET]`; });
  return { text, count };
}

export default function Home() {
  const [locale, setLocale] = useState<AppLocale>("en");
  const t: Translator = (key: TranslationKey, vars?: TranslateVars) => translate(locale, key, vars);
  const filters: { label: string; value: "all" | Kind }[] = [
    { label: t("filterAll"), value: "all" }, { label: t("filterMessages"), value: "message" },
    { label: t("filterTasks"), value: "task" }, { label: t("filterDecisions"), value: "decision" },
    { label: t("filterFiles"), value: "file" },
  ];
  const numberLocale = locale === "vi" ? "vi-VN" : locale;
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [projectList, setProjectList] = useState<LocalProject[]>(seedProjects);
  const [activeProjectId, setActiveProjectId] = useState("pdf");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [historyOpen, setHistoryOpen] = useState(true);
  const [projectSearch, setProjectSearch] = useState("");
  const [draggingProject, setDraggingProject] = useState("");
  const [folderHandle, setFolderHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [selectedWorkspaceFile, setSelectedWorkspaceFile] = useState("");
  const [workspaceFileText, setWorkspaceFileText] = useState("");
  const [executionMode, setExecutionMode] = useState<"analyze" | "execute">("analyze");
  const [pendingPatch, setPendingPatch] = useState<PendingPatch | null>(null);
  const [workspaceError, setWorkspaceError] = useState("");
  const [lastRedactions, setLastRedactions] = useState(0);
  const [interviewAnswers, setInterviewAnswers] = useState<Record<string,string>>({});
  const [pendingInterview, setPendingInterview] = useState<PendingInterview | null>(null);
  const [handsBusy, setHandsBusy] = useState("");
  const [clarificationOverride, setClarificationOverride] = useState("");
  const [safetyPurpose, setSafetyPurpose] = useState("");
  const [commentingEntry, setCommentingEntry] = useState("");
  const [entryComments, setEntryComments] = useState<Record<string,string>>({});
  const [draft, setDraft] = useState("");
  const [settledDraft, setSettledDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadError, setUploadError] = useState("");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [rememberKey, setRememberKey] = useState(true);
  const [credentialProvider, setCredentialProvider] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelCapabilities, setModelCapabilities] = useState<Record<string, ModelCapability>>({});
  const [connecting, setConnecting] = useState(false);
  const [sending, setSending] = useState(false);
  const [inlineAnswers, setInlineAnswers] = useState<Record<string, Record<string,string>>>({});
  const [budgetTier, setBudgetTier] = useState<"economy" | "balanced" | "quality">("balanced");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lastSavings, setLastSavings] = useState<PromptSavings | null>(null);
  const [sessionSavings, setSessionSavings] = useState({ compactTokens: 0, freeTokens: 0, savedTokens: 0, requests: 0 });
  const [providersOpen, setProvidersOpen] = useState(false);
  const [clarifiedScope, setClarifiedScope] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | Kind>("all");
  const [selected, setSelected] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const composerWrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const providerSetupRef = useRef<HTMLDivElement>(null);
  const apiKeyInputRef = useRef<HTMLInputElement>(null);
  const requestInFlightRef = useRef(false);
  const requestAbortRef = useRef<AbortController | null>(null);
  const connectionInFlightRef = useRef(false);
  const folderHandlesRef = useRef<Record<string, FileSystemDirectoryHandle>>({});

  useEffect(() => {
    const saved = localStorage.getItem("minimum-ui-locale") as AppLocale | null;
    const detected = saved && supportedLocales.includes(saved) ? saved : detectLocale(navigator.languages);
    document.documentElement.lang = detected;
    queueMicrotask(() => setLocale(detected));
  }, []);

  const changeLocale = (next: AppLocale) => {
    setLocale(next);
    localStorage.setItem("minimum-ui-locale", next);
    document.documentElement.lang = next;
  };

  const visibleEntries = useMemo(() => entries.map(entry => entry.id === "security-policy"
    ? { ...entry, title: t("securityBaseline"), text: t("securityBaselineText"), time: t("today"), meta: t("securityPinned") }
    : { ...entry, time: localizeKnownTime(entry.time, t) }), [entries, locale]);

  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    return visibleEntries.filter(e => (filter === "all" || e.kind === filter) && (!q || `${e.title || ""} ${e.text} ${e.meta || ""}`.toLowerCase().includes(q)));
  }, [visibleEntries, query, filter]);
  const visibleProjects = useMemo(()=>{ const q=projectSearch.toLowerCase().trim(); return projectList.filter(project=>!q||`${project.name} ${project.folderName||""} ${project.entries.map(entry=>`${entry.title||""} ${entry.text}`).join(" ")}`.toLowerCase().includes(q)); },[projectList,projectSearch]);
  const moveProjectToGroup = (id:string,group:"active"|"archive") => setProjectList(prev=>prev.map(project=>project.id===id?{...project,group}:project));
  const deleteProject = async (id: string) => {
    const target = projectList.find(project => project.id === id);
    if (!target || !window.confirm(t("deleteNamedConfirm", { name: target.name }))) return;
    const remaining = projectList.filter(project => project.id !== id);
    delete folderHandlesRef.current[id];
    await folderStore.delete(id).catch(() => undefined);
    setProjectList(remaining);
    if (id === activeProjectId) {
      const next = remaining[0];
      setActiveProjectId(next?.id || "");
      setEntries(next?.entries || []);
      setFolderHandle(null);
      setWorkspaceFiles([]);
      setSelectedWorkspaceFile("");
      setWorkspaceFileText("");
      setPendingPatch(null);
      setPendingInterview(null);
      setInterviewAnswers({});
      setClarificationOverride("");
      setExecutionMode("analyze");
    }
  };

  const updateDraft = (value: string) => {
    setDraft(value);
    setClarifiedScope("");
    setSafetyPurpose("");
    setSettledDraft(value);
  };

  const interviewPlan = useMemo(() => buildInterviewPlan(settledDraft, executionMode, locale), [settledDraft, executionMode, locale]);
  const interviewQuestions = interviewPlan.questions;
  const usagePlan = useMemo(() => buildUsagePlan(settledDraft, t), [settledDraft, locale]);
  const projectIntent = useMemo(() => { const q=settledDraft.toLowerCase(); const active=Boolean(settledDraft.trim())&&(executionMode==="execute"||/(tạo|xây|làm|viết|sản xuất|phát triển).*(video|website|app|ứng dụng|phần mềm|script|code|dự án|automation|workflow|nghiên cứu|báo cáo)/.test(q)); const type=/video|clip|phim/.test(q)?t("typeVideo"):/code|script|website|app|phần mềm/.test(q)?t("typeSoftware"):/nghiên cứu|báo cáo|dữ liệu/.test(q)?t("typeResearch"):t("typeMultiStep"); const strategy=type===t("typeVideo")?t("strategyVideo"):type===t("typeSoftware")?t("strategySoftware"):t("strategyGeneral"); const expensive=/video|clip|phim|hình ảnh|audio|giọng nói|toàn bộ repo|production|pháp lý|tài chính|y tế|nghiên cứu chuyên sâu|nhiều phiên bản/.test(q); const explicitlySmall=/dự án nhỏ|app nhỏ|tool nhỏ|script ngắn|đơn giản|demo|prototype|thử nghiệm|một file|1 file/.test(q); const freeEligible=active&&explicitlySmall&&!expensive; return {active,type,strategy,freeEligible}; },[settledDraft,executionMode,locale]);
  const providerGuide = getProviderGuides(t)[credentialProvider];

  useEffect(() => {
    if (!providersOpen || !credentialProvider) return;
    const timer = window.setTimeout(() => {
      providerSetupRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (credentialProvider !== "Ollama") apiKeyInputRef.current?.focus({ preventScroll: true });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [credentialProvider, providersOpen]);

  const selectCredentialProvider = (name: string) => {
    setCredentialProvider(name);
    setApiKey("");
    setModel("");
    setAvailableModels([]);
    setConnectionError("");
  };
  const activeProject = projectList.find(project => project.id === activeProjectId) || projectList[0];
  const tokenStats = useMemo(() => sumConversationUsage(entries), [entries]);
  const sessionSavedPct = sessionSavings.freeTokens === 0 ? 0 : Math.round((sessionSavings.savedTokens / sessionSavings.freeTokens) * 1000) / 10;
  useEffect(() => {
    const savedProjects = localStorage.getItem("minimum-projects");
    if (savedProjects) { try { const demoIds = new Set(["m1","d1","t1","m2","d2","t2","f1","r1","m3","t3","m4"]); const parsed = (JSON.parse(savedProjects) as LocalProject[]).map(project => { const realEntries = project.entries.filter(entry => !demoIds.has(entry.id)); return { ...project, entries: realEntries.some(entry => entry.id === "security-policy") ? realEntries : [...realEntries, initialEntries.find(entry => entry.id === "security-policy")!] }; }); queueMicrotask(() => { setProjectList(parsed); setActiveProjectId(parsed[0]?.id || "pdf"); setEntries(parsed[0]?.entries || []); }); } catch { /* Ignore invalid local history and keep safe defaults. */ } }
    // "Remembered" connections are persisted in localStorage so they survive closing and
    // reopening Userward; a tab-only connection (not remembered) lives in sessionStorage only.
    // localStorage is checked first because a remembered connection should win on relaunch.
    const savedConnection = localStorage.getItem("minimum-provider-connection") || sessionStorage.getItem("minimum-provider-connection");
    const persisted = Boolean(localStorage.getItem("minimum-provider-connection"));
    if (savedConnection) { try { const saved = JSON.parse(savedConnection) as { provider?: string; model?: string; apiKey?: string }; if (saved.provider && saved.model && saved.apiKey) { queueMicrotask(() => { setProvider(saved.provider!); setCredentialProvider(saved.provider!); setModel(saved.model!); setApiKey(saved.apiKey!); setRememberKey(persisted); }); } } catch { localStorage.removeItem("minimum-provider-connection"); sessionStorage.removeItem("minimum-provider-connection"); } }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 20); }
      if (e.key === "Escape") { setSearchOpen(false); setSettingsOpen(false); }
      if (searchOpen && e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
      if (searchOpen && e.key === "ArrowUp") { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
      if (searchOpen && e.key === "Enter" && results[selected]) jumpTo(results[selected].id);
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen, results, selected]);

  useEffect(() => {
    queueMicrotask(() => setProjectList(prev => prev.map(project => project.id === activeProjectId ? { ...project, entries } : project)));
  }, [activeProjectId, entries]);

  useEffect(() => { localStorage.setItem("minimum-projects", JSON.stringify(projectList)); }, [projectList]);

  const selectProject = async (id: string) => {
    const next = projectList.find(project => project.id === id); if (!next) return;
    const handle = folderHandlesRef.current[id] || await folderStore.get(id).catch(()=>null);
    if (handle) folderHandlesRef.current[id]=handle;
    const permission = handle ? await (handle as any).queryPermission?.({mode:"readwrite"}).catch(()=>"prompt") : "denied";
    const available = permission === "granted" ? handle : null;
    setActiveProjectId(id); setEntries(next.entries); setFolderHandle(available); setWorkspaceFiles([]); setSelectedWorkspaceFile(""); setWorkspaceFileText(""); setPendingPatch(null); setPendingInterview(null); setInterviewAnswers({}); setClarificationOverride(""); setExecutionMode(available ? "execute" : "analyze");
    if (available) await scanFolder(available);
    else if (handle) setWorkspaceError(t("folderRemembered", { name: handle.name }));
  };

  const createProject = () => {
    const name = newProjectName.trim(); if (!name) return;
    const project: LocalProject = { id: `project-${Date.now()}`, name, kind: "project", entries: [] };
    setProjectList(prev => [...prev, project]); setActiveProjectId(project.id); setEntries([]); setNewProjectName(""); setNewProjectOpen(false); setPendingInterview(null); setInterviewAnswers({}); setClarificationOverride("");
  };

  const createChat = () => {
    const now = new Date();
    const chat: LocalProject = { id: `chat-${Date.now()}`, name: `Chat ${now.toLocaleTimeString(numberLocale, { hour: "2-digit", minute: "2-digit" })}`, kind: "chat", entries: [] };
    setProjectList(prev => [...prev, chat]); setActiveProjectId(chat.id); setEntries([]); setFolderHandle(null); setWorkspaceFiles([]); setSelectedWorkspaceFile(""); setWorkspaceFileText(""); setPendingPatch(null); setPendingInterview(null); setInterviewAnswers({}); setClarificationOverride(""); setExecutionMode("analyze");
    setTimeout(()=>document.querySelector<HTMLTextAreaElement>('.composer textarea')?.focus(),20);
  };

  const scanFolder = async (root: FileSystemDirectoryHandle) => {
    const found: WorkspaceFile[] = []; const allowed = /\.(txt|md|csv|json|js|jsx|ts|tsx|py|html|css|xml|yaml|yml|sql|log)$/i;
    const walk = async (dir: FileSystemDirectoryHandle, prefix = "") => {
      for await (const [name, handle] of (dir as FileSystemDirectoryHandle & { entries(): AsyncIterableIterator<[string, FileSystemHandle]> }).entries()) {
        if (found.length >= 200 || name === "node_modules" || name === ".git" || name === "dist") continue;
        const path = prefix ? `${prefix}/${name}` : name;
        if (handle.kind === "directory") await walk(handle as FileSystemDirectoryHandle, path);
        else if (allowed.test(name) || TEXT_FILE.test(name)) found.push({ path, handle: handle as FileSystemFileHandle });
      }
    };
    await walk(root); setWorkspaceFiles(found); return found;
  };

  useEffect(() => {
    let cancelled=false;
    folderStore.get(activeProjectId).then(async handle=>{
      if (!handle || cancelled) return;
      folderHandlesRef.current[activeProjectId]=handle;
      const permission=await (handle as any).queryPermission?.({mode:"readwrite"}).catch(()=>"prompt");
      if (cancelled) return;
      if (permission==="granted") { setFolderHandle(handle); setWorkspaceError(""); setExecutionMode("execute"); await scanFolder(handle); }
      else { setFolderHandle(null); setWorkspaceError(t("folderRemembered", { name: handle.name })); }
    }).catch(()=>{});
    return ()=>{cancelled=true};
  },[activeProjectId]);

  const chooseFolder = async () => {
    setWorkspaceError("");
    try {
      if (!("showDirectoryPicker" in window)) throw new Error(t("folderPickerUnsupported"));
      const remembered = folderHandlesRef.current[activeProjectId] || await folderStore.get(activeProjectId).catch(()=>null);
      const restored = remembered && await (remembered as any).requestPermission?.({mode:"readwrite"}).catch(()=>"denied") === "granted" ? remembered : null;
      const handle = restored || await (window as any).showDirectoryPicker({ mode: "readwrite" }) as FileSystemDirectoryHandle;
      folderHandlesRef.current[activeProjectId] = handle; await folderStore.set(activeProjectId,handle); setFolderHandle(handle); setExecutionMode("execute"); const found = await scanFolder(handle);
      setProjectList(prev => prev.map(project => project.id === activeProjectId ? { ...project, folderName: handle.name } : project));
      if (found[0]) await openWorkspaceFile(found[0]);
    } catch (error) { if ((error as DOMException)?.name !== "AbortError") setWorkspaceError(error instanceof Error ? error.message : t("cannotOpenFolder")); }
  };

  const openWorkspaceFile = async (item: WorkspaceFile) => {
    const file = await item.handle.getFile(); if (file.size > 500_000) { setWorkspaceError(t("fileOver500")); return; }
    setSelectedWorkspaceFile(item.path); setWorkspaceFileText(await file.text()); setWorkspaceError("");
  };

  const applyPendingPatch = async () => {
    if (!pendingPatch || !folderHandle) return;
    try {
      for (const change of pendingPatch.files) {
        const parts = change.path.replace(/\\/g,"/").split("/").filter(Boolean);
        if (!parts.length || change.path.startsWith("/") || /^[A-Za-z]:/.test(change.path) || parts.includes("..")) throw new Error("unsafe_path");
        let dir = folderHandle;
        for (const segment of parts.slice(0,-1)) dir = await dir.getDirectoryHandle(segment, { create: true });
        const fileHandle = await dir.getFileHandle(parts.at(-1)!, { create: true });
        const writable = await fileHandle.createWritable(); await writable.write(change.content); await writable.close();
      }
      await scanFolder(folderHandle);
      setEntries(prev => [...prev, { id: `file-${Date.now()}`, kind: "file", title: t("filesUpdated", { count: pendingPatch.files.length }), text: pendingPatch.summary || t("appliedAfterConfirm"), time: t("justNow"), meta: t("writtenMeta") }]); setPendingPatch(null);
    }
    catch { setWorkspaceError(t("cannotWriteFolder")); }
  };

  function jumpTo(id: string) {
    setSearchOpen(false); setFlash(id);
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" }), 30);
    setTimeout(() => setFlash(null), 2200);
  }

  const sendMessage = (_briefApproval?: unknown, directText?: string, replyContext?: string, sendOptions?: { skipAnswers?: boolean }) => {
    if (requestInFlightRef.current) return;
    const composerSend = directText === undefined;
    let text = (directText ?? draft).trim();
    let overrideNow = clarificationOverride.trim();
    let skipUserBubble = false;
    if (composerSend && pendingInterview) {
      overrideNow = text || clarificationOverride.trim();
      text = pendingInterview.goal;
      const answersNow = sendOptions?.skipAnswers ? {} : interviewAnswers;
      const answerLines = pendingInterview.questions.filter(question => answersNow[question.id]?.trim()).map(question => `${question.label}: ${answersNow[question.id]}`);
      if (answerLines.length || overrideNow) {
        const briefText = [answerLines.length ? `${t("interviewAnswersHeader")}\n${answerLines.join("\n")}` : "", overrideNow].filter(Boolean).join("\n\n");
        setEntries(prev => [...prev, { id: `user-${Date.now()}`, kind: "message", role: "user", text: briefText, time: t("justNow") }]);
      }
      skipUserBubble = true;
      setPendingInterview(null);
    }
    const requestLegal = assessLegalRisk(text);
    const requestCapability = assessCapabilities(text, executionMode, Boolean(folderHandle), t);
    if ((!text && !attachments.length) || !provider) { setProvidersOpen(true); return; }
    if (executeNeedsConnectedFolder(executionMode, Boolean(folderHandle))) {
      const userEntry: Entry = { id: `user-${Date.now()}`, kind: "message", role: "user", text, time: t("justNow") };
      const folderEntry: Entry = { id: `folder-${Date.now()}`, kind: "result", title: t("missingFolderTitle"), text: `${t("missingFolderMessage")} ${t("missingFolderAction")}`, time: t("justNow"), meta: t("missingFolderMeta") };
      setEntries(prev => [...prev, userEntry, folderEntry]);
      setUploadError(""); setWorkspaceError(t("connectFolderBeforeEdit"));
      setSending(false); requestInFlightRef.current = false; setPendingInterview(null);
      setTimeout(() => timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: "smooth" }), 30);
      return;
    }
    if (composerSend && !skipUserBubble) {
      const questions = buildInterviewPlan(text, executionMode, locale).questions;
      if (shouldOfferPostSendInterview({ composerSend: true, alreadyPending: false, questionCount: questions.length })) {
        const userEntry: Entry = { id: `user-${Date.now()}`, kind: "message", role: "user", text, time: t("justNow") };
        setEntries(prev => [...prev, userEntry]);
        setPendingInterview({ entryId: userEntry.id, goal: text, questions });
        setDraft(""); setSettledDraft(text); setInterviewAnswers({}); setClarificationOverride("");
        setTimeout(() => timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: "smooth" }), 30);
        return;
      }
    }
    requestInFlightRef.current = true;
    const userEntry: Entry = { id: `user-${Date.now()}`, kind: "message", role: "user", text, time: t("justNow") };
    if (!skipUserBubble) setEntries(prev => [...prev, userEntry]);
    setSending(true); setUploadError("");
    if (!directText) { setDraft(""); setSettledDraft(""); }
    setTimeout(() => timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: "smooth" }), 30);
    const executionPolicy = executionMode === "execute" ? `EXECUTION MODE: PROJECT_PATCH_PREVIEW\nReturn ONLY valid JSON: {"summary":"short summary","files":[{"path":"relative/path.ext","operation":"create or update","content":"complete file content"}]}. Never use markdown fences. Paths must be relative to the approved workspace. You may create a complete small project with multiple files. Do not claim files were written.` : "EXECUTION MODE: ANALYZE_ONLY (do not claim files were changed)";
    const capabilityManifest = `CAPABILITY MANIFEST:\nAVAILABLE: text chat and analysis; supported file reading; text/code project patch preview; writing files only inside a user-approved folder and only after explicit confirmation; folder list/read/patch and attachment extract in this Userward window after the user confirms.\nNOT AVAILABLE: native video/audio/image generation; binary Office/PDF generation; terminal or arbitrary code execution; dependency installation; deployment; sending email from Userward; opening or clicking Power Automate, Outlook, or other desktop apps.\nCURRENT REQUEST ASSESSMENT: ${requestCapability.level.toUpperCase()} — ${requestCapability.canDo}${requestCapability.cannotDo ? ` Cannot do: ${requestCapability.cannotDo}` : ""}`;
    const safetyInstruction = `SAFETY: Evaluate silently. Never output policy IDs, scores, "safe/allow", or a safety report. Answer the user's goal. Refuse only a concrete harmful action and offer a legal alternative.${safetyPurpose.trim() ? ` Stated purpose: ${safetyPurpose.trim()}.` : ""}`;
    const policy = `${executionPolicy}\n${capabilityManifest}${safetyInstruction}\nUSAGE PROFILE: ${usagePlan.profile}\nPRIORITY: ${usagePlan.priority}\nTOOL STRATEGY: ${usagePlan.tool}\nPROJECT TYPE: ${projectIntent.type}\nROUTING STRATEGY: ${projectIntent.strategy}\nBUDGET MODE: ${projectIntent.freeEligible?"FREE_FIRST — prefer capable free models; never silently upgrade to paid":budgetTier}\nVERIFICATION: ${usagePlan.verification}\nSOURCE POLICY: ${usagePlan.source}\nINFERENCE POLICY: ${usagePlan.inference}\nOUTPUT CONTRACT: ${usagePlan.output}\nCAPABILITY HONESTY: Never claim to have created, rendered, uploaded, sent, published, executed, opened an app, or changed anything unless the connected tool actually performed that action and returned evidence. Writing a script file is not opening Power Automate. Do not tell the user to copy-paste into PAD as if Userward already ran PAD. If the requested artifact or action is unsupported, state that plainly before offering supported alternatives (files in the folder after approval).\nZERO-ASSUMPTION POLICY: Never invent or silently assume missing business requirements, inputs, outputs, destinations, permissions, schedules, constraints, or acceptance criteria. Stop and request clarification when any of these can materially change the result. Ask only where to save, when to run, and similar business facts with short choices. Never ask the end user to select libraries, frameworks, APIs, architecture, platforms, or test tools. Technical defaults are allowed only after business scope is confirmed and must be stated explicitly. USER OVERRIDE POLICY: A free-form answer written by the user has higher priority than AI-suggested choices whenever they conflict.`;
    let redactions = 0;
    const files = attachments.filter(file=>file.text!==undefined).map(file => { const safe = redactSecrets(file.text || ""); redactions += safe.count; const chunks=chunkText(safe.text,24_000).slice(0,4); return `\n\n--- ATTACHED FILE: ${file.name} (${chunks.length} context chunk) ---\n${chunks.join("\n\n--- CONTINUED ---\n")}`; }).join("");
    const binaryAttachments = attachments.filter(file=>file.dataUrl).map(file=>({ name:file.name, dataUrl:file.dataUrl!, mime:file.mime! }));
    const safeWorkspace = redactSecrets(workspaceFileText); redactions += safeWorkspace.count; setLastRedactions(redactions);
    const workspaceContext = executionMode === "execute" ? `\n\n--- WORKSPACE FILE: ${selectedWorkspaceFile} ---\n${safeWorkspace.text}` : "";
    const answersForPrompt = sendOptions?.skipAnswers ? {} : interviewAnswers;
    const selectedAnswers = interviewQuestions.filter(question=>answersForPrompt[question.id]?.trim()).map(question=>`${question.label}: ${answersForPrompt[question.id]}`);
    const interviewParts = [selectedAnswers.length ? `CLARIFICATION ANSWERS:\n${selectedAnswers.join("\n")}` : "", overrideNow ? `USER OVERRIDE (HIGHEST PRIORITY):\n${overrideNow}` : ""].filter(Boolean);
    const clarificationGate = "CLARIFICATION GATE: COMPLETE. Do not ask another requirements interview in this response. Never ask the user to choose architecture, folder structure, source-code layout, libraries, frameworks, APIs, platforms, or tests. Do not finish by telling them to paste into Power Automate as if this app opened it. Select sensible technical defaults yourself, state them briefly, and proceed with the requested work.";
    const interview = interviewParts.length
      ? `\n\n${interviewParts.join("\n\n")}\n\n${clarificationGate}`
      : executionMode === "execute" ? `\n\n${clarificationGate}` : "";
    const goalContract = createGoalContract({ objective: text, executionMode, hasFolder: Boolean(folderHandle), hasAttachments: attachments.length > 0, freeEligible: projectIntent.freeEligible, budgetMode: budgetTier });
    const route = routeForUser(goalContract);
    const contextPack = compileContextPack({ goal: goalContract, policy, attachmentTexts: attachments.filter(file=>file.text!==undefined).map(file=>file.text || ""), workspaceText: executionMode === "execute" ? safeWorkspace.text : "", replyContext });
    const compactChatPolicy = [
      "MODE: DIRECT CHAT / ANALYSIS. Answer the user goal directly and concisely.",
      `OUTPUT: ${usagePlan.output}`,
      `SOURCES: ${usagePlan.source}`,
      `INFERENCE: ${usagePlan.inference}`,
      `BUDGET: ${projectIntent.freeEligible ? "FREE_FIRST; never upgrade silently" : budgetTier}`,
      "Never claim an external action or file change without tool evidence.",
      "Ask only for missing business facts that materially change the answer (where to save, when to run). Clarifying questions must end with ? and list short options. Numbered HOWTO steps must not be a quiz. Never ask the user to choose architecture, libraries, APIs, platforms, source layout, or tests.",
      "If a folder action is needed, emit a uw-hands JSON fence with action run and intent workspace.list|workspace.read|workspace.patch|files.extract, then wait for confirm. desktop.rpa is unavailable: never claim Power Automate or Outlook was opened. Writing files is not running PAD.",
      requestCapability.level !== "supported" ? capabilityManifest : "",
      safetyInstruction,
    ].filter(Boolean).join("\n");
    const userInterestManifest = executionMode === "execute"
      ? `USERWARD GOAL CONTRACT:\n${JSON.stringify(goalContract)}\nROUTING DECISION:\n${JSON.stringify(route)}\nCONTEXT PACK:\n${JSON.stringify(contextPack)}\nUSER INTEREST CONSTITUTION:\n${USER_INTEREST_CONSTITUTION.map((rule,index)=>`${index+1}. ${rule}`).join("\n")}`
      : compactChatPolicy;
    const effectivePolicy = executionMode === "execute" ? policy : "";
    const policyNotice = policyResultWarning(requestLegal, locale);
    const capabilityNotice = requestCapability.level === "unsupported"
      ? `${capabilityHeading(requestCapability.level, t)} — ${[requestCapability.cannotDo, requestCapability.needs].filter(Boolean).join(" ")}`.trim()
      : "";
    const resultNotice = [policyNotice, capabilityNotice].filter(Boolean).join("\n\n");
    const selectedModel = provider==="OpenRouter"&&projectIntent.freeEligible?"openrouter/free":model;
    const goalText = text || "Phân tích các file đính kèm.";
    const currentPrompt = `${userInterestManifest}${effectivePolicy ? `\n\n${effectivePolicy}` : ""}${replyContext ? `\n\nRESULT BEING COMMENTED ON:\n${replyContext}` : ""}\n\nUSER GOAL${replyContext ? " / DIRECT COMMENT" : ""}:\n${goalText}${clarifiedScope ? `\n\nPhạm vi đã làm rõ: ${clarifiedScope}` : ""}${interview}${files}${workspaceContext}`;
    const promptExtras = `${clarifiedScope ? `\n\nPhạm vi đã làm rõ: ${clarifiedScope}` : ""}${interview}${files}${workspaceContext}${replyContext ? `\n\nRESULT BEING COMMENTED ON:\n${replyContext}` : ""}`;
    const requestSavings = measureContextPackSavings(currentPrompt, goalText, promptExtras);
    setLastSavings(requestSavings);
    setSessionSavings(prev => ({
      compactTokens: prev.compactTokens + requestSavings.compactTokens,
      freeTokens: prev.freeTokens + requestSavings.freeTokens,
      savedTokens: prev.savedTokens + requestSavings.savedTokens,
      requests: prev.requests + 1,
    }));
    const contextBudget = Math.min(30_000, Math.floor((modelCapabilities[selectedModel]?.contextTokens || 32_000) * 0.55));
    const messages = [...buildRecentConversation(entries, contextBudget), { role: "user" as const, content: currentPrompt }];
    const controller = new AbortController(); requestAbortRef.current = controller;
    const requestTimeoutId = window.setTimeout(() => {
      controller.abort(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }));
    }, PROVIDER_TOTAL_TIMEOUT_MS + 5_000);
    const streamingId = `stream-${Date.now()}`;
    const promptForEstimate = messages.map(item => item.content).join("\n");
    fetch("/api/providers/chat", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, apiKey, model: selectedModel, executionMode, stream: executionMode === "analyze", budgetMode: projectIntent.freeEligible ? "free-first" : budgetTier, attachments: binaryAttachments, maxOutputTokens: executionMode === "execute" ? 7000 : 1800, messages }) })
      .then(response => readProviderJson(response, provider, t, partial => setEntries(prev => { const existing=prev.find(entry=>entry.id===streamingId); const live=estimateTurnUsage(promptForEstimate, partial); return existing?prev.map(entry=>entry.id===streamingId?{...entry,text:partial,usage:live}:entry):[...prev,{id:streamingId,kind:"message",role:"ai",text:partial,time:t("answering"),usage:live}]; })))
      .then(data => { const usage = data.usage?.totalTokens ? data.usage : estimateTurnUsage(promptForEstimate, String(data.text || "")); if (executionMode === "execute") { try { const patch = parsePendingPatch(String(data.text)); setPendingPatch(patch); const receipt=createExecutionReceipt({status:"preview",model:data.selectedModel||selectedModel,context:contextPack,usage,changes:patch.files.map(file=>`${file.operation}: ${file.path}`),evidence:["Provider returned a validated patch preview", "No file has been written"]}); setEntries(prev => [...prev, { id: `patch-${Date.now()}`, kind: "result", title: t("filesAwaiting", { count: patch.files.length }), text: patch.summary || t("patchNotWritten"), time: t("justNow"), meta: t("previewPending"), usage, receipt, notice: resultNotice || undefined }]); } catch { throw new Error(t("invalidPatch")); } } else { const receipt=createExecutionReceipt({status:"completed",model:data.selectedModel||selectedModel,context:contextPack,usage}); setEntries(prev => prev.some(entry=>entry.id===streamingId)?prev.map(entry=>entry.id===streamingId?{...entry,text:data.text,time:t("justNow"),usage,receipt,notice:resultNotice||undefined}:entry):[...prev, { id: `ai-${Date.now()}`, kind: "message", role: "ai", text: data.text, time: t("justNow"), usage, receipt, notice: resultNotice || undefined }]); } })
      .catch(error => {
        const abortReason = controller.signal.reason;
        const timedOut = (abortReason instanceof Error && abortReason.name === "TimeoutError") || (error instanceof Error && error.name === "TimeoutError");
        if (timedOut) {
          const failure = error instanceof ProviderRequestError ? error.failure : explainProviderFailure(504, provider, "timeout", t);
          setEntries(prev => [...prev, { id: `error-${Date.now()}`, kind: "result", title: failure.title, text: `${failure.message} ${failure.action}`, time: t("justNow"), meta: failure.meta }]);
          return;
        }
        if ((error as DOMException)?.name === "AbortError") { setEntries(prev => [...prev, { id: `stopped-${Date.now()}`, kind: "result", title: t("requestStoppedTitle"), text: t("requestStoppedText"), time: t("justNow"), meta: t("stoppedMeta") }]); return; }
        const failure = error instanceof ProviderRequestError ? error.failure : explainClientFailure(error, t);
        const privacy = isOpenRouterPrivacyRestriction(`${failure.title} ${failure.message} ${failure.action} ${failure.meta}`) || (error instanceof Error && isOpenRouterPrivacyRestriction(error.message));
        if (privacy) { const text = openRouterPrivacyAssistantText(t); setEntries(prev => prev.some(entry=>entry.id===streamingId)?prev.map(entry=>entry.id===streamingId?{...entry,kind:"message",role:"ai",text,time:t("justNow")}:entry):[...prev, { id: `ai-${Date.now()}`, kind: "message", role: "ai", text, time: t("justNow") }]); return; }
        setEntries(prev => [...prev, { id: `error-${Date.now()}`, kind: "result", title: failure.title, text: `${failure.message} ${failure.action}`, time: t("justNow"), meta: failure.meta }]);
      })
      .finally(() => { window.clearTimeout(requestTimeoutId); requestAbortRef.current = null; requestInFlightRef.current = false; setSending(false); setClarifiedScope(""); setInterviewAnswers({}); setClarificationOverride(""); setCommentingEntry(""); setAttachments([]); setTimeout(() => timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: "smooth" }), 30); });
  };

  const submitEntryComment = (entry: Entry) => {
    const comment = (entryComments[entry.id] || "").trim();
    if (!comment || sending) return;
    setEntryComments(prev => ({ ...prev, [entry.id]: "" }));
    sendMessage(false, comment, `${entry.title ? `${entry.title}\n` : ""}${entry.text}`);
  };

  const submitInlineInterview = (entry: Entry, questions: InlineQuestion[]) => {
    const answers = inlineAnswers[entry.id] || {};
    const response = questions.map((question,index)=>`${index+1}. ${question.ask}\n→ ${answers[question.id] || t("unanswered")}`).join("\n\n");
    if (!questions.every(question=>answers[question.id]?.trim()) || sending) return;
    sendMessage(false, `${t("interviewAnswersHeader")}\n\n${response}`, `${entry.title ? `${entry.title}\n` : ""}${entry.text}`);
  };

  const dispatchLocalHand = async (entry: Entry, goal: string) => {
    if (handsBusy) return;
    const command = parseHandsBlock(entry.text);
    const intent = command?.intent || inferHandIntent(goal || entry.text);
    setHandsBusy(entry.id);
    try {
      const result = runBrowserHand(intent, {
        folderName: folderHandle?.name,
        filePaths: workspaceFiles.map(file => file.path),
        selectedPath: selectedWorkspaceFile || undefined,
        selectedText: workspaceFileText || undefined,
        attachmentNames: attachments.map(file => file.name),
        hasPendingPatch: Boolean(pendingPatch),
        executeMode: executionMode === "execute",
      }, t);
      if (intent === "workspace.patch" && result.ok && pendingPatch) await applyPendingPatch();
      const evidence = result.evidence.length ? result.evidence : [result.message];
      const receipt = createExecutionReceipt({ status: result.ok ? "completed" : "failed", model, context: compileContextPack({ goal: createGoalContract({ objective: goal, executionMode, hasFolder: Boolean(folderHandle), hasAttachments: attachments.length > 0, freeEligible: false, budgetMode: budgetTier }), policy: "local-hands", attachmentTexts: [] }), changes: intent === "workspace.patch" && result.ok ? ["workspace-patch"] : [], evidence });
      setEntries(prev => [...prev, { id: `hands-${Date.now()}`, kind: "result", title: t("handTitle"), text: result.message, time: t("justNow"), meta: intent, receipt }]);
    } catch {
      setEntries(prev => [...prev, { id: `hands-${Date.now()}`, kind: "result", title: t("handTitle"), text: t("handUnavailable"), time: t("justNow") }]);
    } finally {
      setHandsBusy("");
    }
  };

  const attachFiles = async (list: FileList | null) => {
    if (!list) return;
    setUploadError("");
    const textAllowed = TEXT_FILE;
    const binaryAllowed = /\.(pdf|png|jpe?g|webp|gif)$/i;
    const picked = Array.from(list).slice(0, 5);
    const maxFileBytes = 10 * 1024 * 1024;
    const selectedCapability = modelCapabilities[model];
    if (selectedCapability && picked.some(file => file.type.startsWith("image/")) && !selectedCapability.image) { setUploadError(t("modelNoImages")); return; }
    if (selectedCapability && picked.some(file => file.type === "application/pdf" || /\.pdf$/i.test(file.name)) && !selectedCapability.pdf) { setUploadError(t("modelNoPdfs")); return; }
    const unsupported = picked.find(file => !textAllowed.test(file.name) && !binaryAllowed.test(file.name) && !OFFICE_FILE.test(file.name));
    if (unsupported) { setUploadError(t("formatNotSupported", { name: unsupported.name })); return; }
    const oversized = picked.find(file => file.size > maxFileBytes);
    if (oversized) { setUploadError(t("fileOver10mb", { name: oversized.name })); return; }
    const totalBytes = [...attachments, ...picked].reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > maxFileBytes) { setUploadError(t("totalOver10mb")); return; }
    try {
      const loaded = await Promise.all(picked.map(async file => binaryAllowed.test(file.name) ? await new Promise<Attachment>((resolve,reject)=>{ const reader=new FileReader(); reader.onload=()=>resolve({name:file.name,size:file.size,dataUrl:String(reader.result),mime:file.type||"application/octet-stream"}); reader.onerror=()=>reject(reader.error); reader.readAsDataURL(file); }) : OFFICE_FILE.test(file.name) ? ({ name:file.name, size:file.size, text:await extractOfficeText(file), mime:file.type||"application/octet-stream" }) : ({ name: file.name, size: file.size, text: await file.text(), mime:file.type||"text/plain" })));
      setAttachments(prev => [...prev, ...loaded].slice(0, 5));
    } catch (error) {
      setUploadError(error instanceof Error ? t("cannotReadOffice", { message: error.message }) : t("cannotReadOfficeGeneric"));
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const connectProvider = async () => {
    if (connectionInFlightRef.current || !credentialProvider || (credentialProvider !== "Ollama" && !apiKey.trim())) return;
    connectionInFlightRef.current = true;
    setConnecting(true); setConnectionError("");
    try {
      const response = await fetch("/api/providers/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: credentialProvider, apiKey }) });
      const rawResponse = await response.text();
      let data: { error?: string; code?: string; models?: string[]; model?: string; capabilities?: ModelCapability[] } = {};
      try { data = rawResponse ? JSON.parse(rawResponse) : {}; }
      catch { throw new ProviderRequestError(explainProviderFailure(response.status || 502, credentialProvider, rawResponse, t)); }
      if (!response.ok) throw new ProviderRequestError(explainProviderFailure(response.status, credentialProvider, [data.code, data.error].filter(Boolean).join(" "), t));
      const connectedModel = data.model?.trim();
      if (!connectedModel) throw new ProviderRequestError({ title: t("noSuitableModel"), message: t("connectedNoText", { provider: credentialProvider }), action: t("checkOrSwitchProvider"), meta: t("noModelMeta", { provider: credentialProvider }) });
      const models = (data.models || [connectedModel]).filter((item): item is string => Boolean(item));
      setAvailableModels(models); setModelCapabilities(Object.fromEntries((data.capabilities || models.map(id => inferModelCapability(credentialProvider, id))).map(item => [item.id, item]))); setModel(connectedModel);
    } catch (error) { const failure = error instanceof ProviderRequestError ? error.failure : explainProviderFailure(502, credentialProvider, error instanceof Error ? error.message : "", t); setConnectionError(`${failure.title}. ${failure.message} ${failure.action}`); }
    finally { connectionInFlightRef.current = false; setConnecting(false); }
  };

  const saveProvider = () => {
    if (!credentialProvider || (credentialProvider !== "Ollama" && !apiKey.trim()) || !model) return;
    setProvider(credentialProvider);
    const payload = JSON.stringify({ provider: credentialProvider, model, apiKey: credentialProvider === "Ollama" ? "local" : apiKey });
    // "Ghi nhớ trên máy này" persists to localStorage so the connection survives closing
    // Userward; unchecked, it lives only in sessionStorage for this tab (cleared on close).
    if (rememberKey) { localStorage.setItem("minimum-provider-connection", payload); sessionStorage.removeItem("minimum-provider-connection"); }
    else { sessionStorage.setItem("minimum-provider-connection", payload); localStorage.removeItem("minimum-provider-connection"); }
    setProvidersOpen(false); setCredentialProvider(""); setAvailableModels([]);
  };

  const disconnectProvider = () => {
    setProvider(""); setModel(""); setApiKey("");
    localStorage.removeItem("minimum-provider-connection"); sessionStorage.removeItem("minimum-provider-connection");
  };

  const clearLocalData = async () => {
    if (!window.confirm(t("clearLocalConfirm"))) return;
    ["minimum-ui-locale", "minimum-projects", "minimum-provider-connection"].forEach(key=>localStorage.removeItem(key));
    sessionStorage.removeItem("minimum-provider-connection");
    await new Promise<void>((resolve) => { const request=indexedDB.deleteDatabase("minimum-workspace"); request.onsuccess=request.onerror=request.onblocked=()=>resolve(); });
    window.location.reload();
  };

  return <main className="shell">
    <aside className="projects">
      <div className="brand"><div className="brandmark">U</div><span>Userward</span><em>LOCAL · {PRODUCT_EDITION==="personal"?"PERSONAL":"COMMUNITY"}</em></div>
      {PRODUCT_EDITION === "community" && <small className="edition-scope">Chat · Files · Coding only</small>}
      <label className="language-picker"><span>{t("language")}</span><select value={locale} onChange={event=>changeLocale(event.target.value as AppLocale)} aria-label={t("language")}>{supportedLocales.map(item=><option key={item} value={item}>{localeNames[item]}</option>)}</select></label>
      <button className="new-project" onClick={createChat}><Icon name="plus"/> {t("newChat")}</button>
      <button className="new-project-link" onClick={()=>setNewProjectOpen(true)}>＋ {t("newProject")}</button>
      <button className="provider-button" onClick={()=>setProvidersOpen(true)}>⌘ <span>{provider || t("connectModel")}</span><b>{provider ? "✓" : "0"}</b></button>
      <button className="history-toggle" type="button" onClick={()=>setHistoryOpen(open=>!open)}><span>{t("history")}</span><b>{visibleProjects.length}</b><i>{historyOpen?"⌃":"⌄"}</i></button>
      {historyOpen&&<div className="project-library"><label className="project-search"><span>⌕</span><input value={projectSearch} onChange={event=>setProjectSearch(event.target.value)} placeholder={t("searchProjects")}/>{projectSearch&&<button type="button" onClick={()=>setProjectSearch("")}>×</button>}</label>{(["active","archive"] as const).map(group=><section className="project-group" key={group} onDragOver={event=>event.preventDefault()} onDrop={()=>{if(draggingProject)moveProjectToGroup(draggingProject,group);setDraggingProject("")}}><header><span>{group==="active"?t("active"):t("archived")}</span><b>{visibleProjects.filter(project=>(project.group||"active")===group).length}</b><small>{t("dragHere")}</small></header><nav>{visibleProjects.filter(project=>(project.group||"active")===group).map(project=><div className="project-row" key={project.id}><button draggable onDragStart={()=>setDraggingProject(project.id)} onDragEnd={()=>setDraggingProject("")} onClick={()=>selectProject(project.id)} className={`${project.id===activeProjectId?"project active":"project"}${draggingProject===project.id?" dragging":""}`}><span className="project-dot">{project.name[0]}</span><span><b>{project.name}</b><small>{project.folderName||`${project.entries.length} ${t("historyItems")}`}</small></span>{project.id===activeProjectId&&<span className="live-dot"/>}</button><button type="button" className="project-delete" aria-label={`${t("deleteHistory")} ${project.name}`} title={t("deleteHistory")} onClick={()=>deleteProject(project.id)}>×</button></div>)}</nav></section>)}{!visibleProjects.length&&<div className="project-empty">{t("noProjects")}</div>}</div>}
    </aside>

    <section className="workspace">
      <header className="topbar"><div><span className="crumb">{t("project")}</span><h1>{activeProject?.name || t("project")} <span>{folderHandle ? folderHandle.name : t("noFolder")}</span></h1></div><button className="search-trigger" onClick={() => {setSearchOpen(true); setTimeout(()=>searchRef.current?.focus(), 20)}}><Icon name="search"/><span>{t("searchProject")}</span><kbd>Ctrl K</kbd></button></header>
      <div className="timeline" id="timeline" ref={timelineRef}>
        {visibleEntries.map((e, i) => <div key={e.id} id={e.id} className={`entry ${e.kind} ${e.role || ""} ${flash === e.id ? "flash" : ""}`}>
          {e.kind === "message" ? <>
            <div className="avatar">{e.role === "user" ? "HT" : "U"}</div><div className="message-body"><div className="message-head"><b>{e.role === "user" ? t("you") : "Userward"}</b><time>{e.time}</time></div><p>{e.role==="ai"?stripHandsFence(e.text):e.text}</p>{e.notice&&<p className="result-warning">{e.notice}</p>}{e.role==="user"&&pendingInterview?.entryId===e.id&&<div className="interview-card"><div className="interview-head"><span>?</span><div><b>{t("completeBriefHere")}</b><small>{t("interviewAfterSendHint")}</small></div><em>{clarificationOverride.trim()?t("customOptionReady"):`${pendingInterview.questions.filter(question=>interviewAnswers[question.id]?.trim()).length}/${pendingInterview.questions.length}`}</em></div><div className="interview-table">{pendingInterview.questions.map((question,index)=><div className="interview-row" key={question.id}><span><b>{index+1}. {question.label}</b><small>{question.ask}</small></span><div className="choice-list">{question.options.map(option=>{const selected=question.multi?(interviewAnswers[question.id]||"").split(" · ").includes(option):interviewAnswers[question.id]===option;return <button type="button" className={selected?"selected":""} onClick={()=>setInterviewAnswers(prev=>{if(!question.multi)return {...prev,[question.id]:option};const current=(prev[question.id]||"").split(" · ").filter(Boolean);const next=current.includes(option)?current.filter(item=>item!==option):[...current,option];return {...prev,[question.id]:next.join(" · ")}})} key={option}><span className="tick-box">{selected?"✓":""}</span>{option}</button>})}</div></div>)}</div><div className="inline-override"><label htmlFor="brief-override">{t("otherOption")}</label><textarea id="brief-override" value={clarificationOverride} onChange={event=>setClarificationOverride(event.target.value)} placeholder={t("otherOptionPlaceholder")}/><small>{t("userTextPriority")}</small></div><div className="interview-actions"><button type="button" className="primary" onClick={()=>sendMessage(false)} disabled={sending}>{t("sendBriefAnswers")}</button><button type="button" onClick={()=>sendMessage(false, undefined, undefined, { skipAnswers: true })} disabled={sending}>{t("continueWithoutAnswers")}</button></div></div>}{e.role==="ai"&&(parseHandsBlock(e.text)||looksLikeHandGoal(e.text)||looksLikeHandGoal(visibleEntries.slice(0,i).reverse().find(item=>item.role==="user")?.text||""))&&<div className="hands-card"><div><b>{t("handTitle")}</b><span>{t("handHint")}</span></div><button type="button" className="primary" disabled={Boolean(handsBusy)} onClick={()=>dispatchLocalHand(e, visibleEntries.slice(0,i).reverse().find(item=>item.role==="user")?.text||e.text)}>{handsBusy===e.id?t("handWorking"):t("handRun")}</button></div>}{e.role==="ai"&&parseInlineQuestions(e.text, t).length>0&&<div className="inline-interview"><header><b>{t("replyHere")}</b><span>{t("replyHereHint")}</span></header>{parseInlineQuestions(e.text, t).map((question,index)=>{const value=inlineAnswers[e.id]?.[question.id]||"";return <div className="inline-question" key={question.id}><b>{index+1}. {question.ask}</b>{question.options.length>0?<div className="inline-choices">{question.options.map((option,optionIndex)=>{const selected=question.multi?value.split(" · ").includes(option):value===option;const suggested=optionIndex===0;return <button type="button" className={[selected?"selected":"",suggested?"suggested":""].filter(Boolean).join(" ")} key={option} onClick={()=>setInlineAnswers(prev=>{const current=prev[e.id]||{};if(!question.multi)return {...prev,[e.id]:{...current,[question.id]:option}};const chosen=(current[question.id]||"").split(" · ").filter(Boolean);const next=chosen.includes(option)?chosen.filter(item=>item!==option):[...chosen,option];return {...prev,[e.id]:{...current,[question.id]:next.join(" · ")}}})}><i>{selected?"✓":""}</i>{option}{suggested&&<em>{t("suggestedOption")}</em>}</button>})}</div>:<input value={value} onChange={event=>setInlineAnswers(prev=>({...prev,[e.id]:{...(prev[e.id]||{}),[question.id]:event.target.value}}))} placeholder={t("shortAnswerPlaceholder")}/>}</div>})}<button type="button" className="submit-inline" disabled={sending||!parseInlineQuestions(e.text, t).every(question=>inlineAnswers[e.id]?.[question.id]?.trim())} onClick={()=>submitInlineInterview(e,parseInlineQuestions(e.text, t))}>{t("sendTheseAnswers")}</button></div>}{e.receipt&&<ReceiptLine receipt={e.receipt} t={t} locale={locale}/>} {e.role==="ai"&&<div className="entry-feedback"><button type="button" onClick={()=>setCommentingEntry(commentingEntry===e.id?"":e.id)}>✎ {t("commentResult")}</button>{commentingEntry===e.id&&<div className="entry-comment-box"><textarea autoFocus value={entryComments[e.id]||""} onChange={event=>setEntryComments(prev=>({...prev,[e.id]:event.target.value}))} placeholder={t("commentPlaceholder")}/><div><button type="button" onClick={()=>setCommentingEntry("")}>{t("cancel")}</button><button type="button" className="submit-comment" disabled={sending||!(entryComments[e.id]||"").trim()} onClick={()=>submitEntryComment(e)}>{t("sendComment")}</button></div></div>}</div>}</div>
          </> : <><div className="rail"><span>{e.kind === "decision" ? "◆" : e.kind === "task" ? "✓" : e.kind === "file" ? "↗" : "●"}</span></div><div className="card"><div className="card-top"><div><small>{e.meta}</small><h3>{e.title}</h3></div><time>{e.time}</time></div><p>{e.text}</p>{e.notice&&<p className="result-warning">{e.notice}</p>}{e.kind === "task" && i === 9 && <div className="progress"><i/><span>{t("executing")}</span></div>}{e.receipt&&<ReceiptLine receipt={e.receipt} t={t} locale={locale}/>} {(["result","file","task"] as Kind[]).includes(e.kind)&&<div className="entry-feedback"><button type="button" onClick={()=>setCommentingEntry(commentingEntry===e.id?"":e.id)}>✎ {t("commentResult")}</button>{commentingEntry===e.id&&<div className="entry-comment-box"><textarea autoFocus value={entryComments[e.id]||""} onChange={event=>setEntryComments(prev=>({...prev,[e.id]:event.target.value}))} placeholder={t("commentPlaceholder")}/><div><button type="button" onClick={()=>setCommentingEntry("")}>{t("cancel")}</button><button type="button" className="submit-comment" disabled={sending||!(entryComments[e.id]||"").trim()} onClick={()=>submitEntryComment(e)}>{t("sendComment")}</button></div></div>}</div>}</div></>}
          {pendingPatch&&e.kind==="result"&&e.id.startsWith("patch-")&&<div className="inline-patch-approval"><div><b>{t("filesReady", { count: pendingPatch.files.length })}</b><span>{pendingPatch.files.map(file=>`${file.operation}: ${file.path}`).join(" · ")}</span></div><button type="button" onClick={()=>setPendingPatch(null)}>{t("cancel")}</button><button type="button" className="apply" onClick={applyPendingPatch}>{t("applyPatch")}</button></div>}
          {e.kind==="result"&&e.id.startsWith("folder-")&&<div className="inline-folder-actions"><button type="button" onClick={chooseFolder}>{t("changeFolder")}</button><button type="button" className="apply" onClick={()=>setExecutionMode("analyze")}>{t("normalChat")}</button></div>}
        </div>)}
      </div>
      <div className="composer-wrap" ref={composerWrapRef}>
        <div className="work-mode"><button className={executionMode==="analyze"?"active":""} onClick={()=>setExecutionMode("analyze")}><b>{t("normalChat")}</b><span>{t("normalChatHint")}</span></button><button className={executionMode==="execute"?"active":""} onClick={()=>folderHandle?setExecutionMode("execute"):chooseFolder()}><b>{t("projectWork")}</b><span>{folderHandle?`${t("folderPrefix")} ${folderHandle.name}`:t("chooseFolderOnDevice")}</span></button>{executionMode==="execute"&&<button className="change-folder" onClick={chooseFolder}>{t("changeFolder")}</button>}</div>
        {executionMode==="execute"&&!folderHandle&&<div className="folder-required-banner"><b>{t("missingFolderTitle")}</b><p>{t("missingFolderMessage")} {t("missingFolderAction")}</p><div><button type="button" className="primary" onClick={chooseFolder}>{t("changeFolder")}</button><button type="button" onClick={()=>setExecutionMode("analyze")}>{t("normalChat")}</button></div></div>}
        {sending&&<div className="processing-card"><span className="processing-spinner"/><div><b>{t("processing")}</b><small>{t("processingHint")}</small></div><em>{t("running")}</em></div>}
        {!provider ? <div className="connection-warning"><span>!</span><p><b>{t("noModelYet")}</b> {t("connectToStart")}</p><button onClick={()=>setProvidersOpen(true)}>{t("connectModel")}</button></div> : <div className="connected-bar"><span>✓</span><p><b>{provider}</b> · {model}</p><button onClick={disconnectProvider}>{t("disconnect")}</button></div>}
        <div className="execution-mode"><div><b>{executionMode === "execute" ? t("executeWithApproval") : t("chatAnalyze")}</b><span>{executionMode === "execute" ? t("canEditInFolder", { name: folderHandle?.name || t("defaultFolder") }) : t("readAndReply")}</span></div><button disabled={executionMode !== "execute" && !folderHandle} onClick={()=>setExecutionMode(mode=>mode === "analyze" ? "execute" : "analyze")}>{executionMode === "execute" ? t("switchAnalyze") : folderHandle ? t("enableExecute") : t("connectToExecute")}</button></div>{pendingPatch&&<div className="patch-preview"><div><b>{t("filesPendingReview", { count: pendingPatch.files.length })}</b><span>{pendingPatch.summary}</span><small>{pendingPatch.files.map(file=>`${file.operation}: ${file.path}`).join(" · ")}</small></div><button onClick={()=>setPendingPatch(null)}>{t("cancel")}</button><button className="apply" onClick={applyPendingPatch}>{t("applyPatch")}</button></div>}{attachments.length>0&&<div className="attachment-list">{attachments.map(file=><span key={file.name}>↗ {file.name} <small>{Math.ceil(file.size/1024)} KB</small><button onClick={()=>setAttachments(prev=>prev.filter(item=>item.name!==file.name))}>×</button></span>)}</div>}{uploadError&&<div className="upload-error">{uploadError}</div>}<div className="composer"><textarea aria-label={t("composerAria")} value={draft} onChange={e=>updateDraft(e.target.value)} onKeyDown={e=>{if(e.nativeEvent.isComposing)return;if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage(false)}}} placeholder={provider ? t("prompt") : t("promptNoModel")}/><div className="composer-actions"><div><select aria-label={t("providerSelectAria")} value={provider || ""} disabled><option>{provider ? `${provider} · ${model}` : t("noModel")}</option></select><input ref={fileRef} className="file-input" type="file" multiple accept=".txt,.md,.markdown,.csv,.tsv,.json,.jsonl,.ndjson,.xml,.yaml,.yml,.toml,.ini,.cfg,.conf,.log,.sql,.html,.htm,.css,.scss,.sass,.less,.svg,.tex,.bib,.eml,.ics,.vcf,.js,.jsx,.mjs,.cjs,.ts,.tsx,.py,.ipynb,.java,.c,.cc,.cpp,.cxx,.h,.hpp,.cs,.go,.rs,.rb,.php,.swift,.kt,.kts,.dart,.lua,.r,.sh,.bash,.zsh,.fish,.ps1,.bat,.cmd,.vue,.svelte,.pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.xlsx,.pptx,.odt,.ods,.odp,.rtf,text/*,application/pdf,image/*" onChange={e=>attachFiles(e.target.files)}/><button onClick={()=>fileRef.current?.click()}>＋ {t("attach")}</button><button className="context-on"><i/> {t("autoContext")}</button></div></div></div><p>{t("taskCanvasHint")}</p>
        {sending?<button type="button" className="unified-run" onClick={()=>requestAbortRef.current?.abort()}>{t("stopRequest")}<span>■</span></button>:<button type="button" className="unified-run" onClick={()=>sendMessage(false)} disabled={composerRunDisabled({ hasProvider: Boolean(provider), hasDraftOrAttachments: Boolean(draft.trim() || attachments.length || pendingInterview), executeNeedsFolder: executeNeedsConnectedFolder(executionMode, Boolean(folderHandle)) })}>{executionMode==="execute"?t("confirmAndRun"):t("send")}<span>→</span></button>}
      </div>
    </section>

    <aside className="brain">
      <div className="brain-title">
        <Icon name="brain"/>
        <div><span>{t("userwardLocal")}</span><b>{t("localOnly")}</b></div>
        <button type="button" className="brain-settings" onClick={()=>setSettingsOpen(true)} aria-label={t("settings")} title={t("settings")}><Icon name="settings"/><span>{t("settings")}</span></button>
      </div>
      <section className="token-dashboard">
        <div className="section-row"><label>{t("tokenUse")}</label><span>{tokenStats.measured} {t("measuredTasks")}</span></div>
        <div className="token-total"><span>{t("conversationTotal")}</span><b>{tokenStats.total.toLocaleString(numberLocale)} <small>token</small></b></div>
        <div className="token-split">
          <div><span>{t("contextInput")}</span><b>{tokenStats.input.toLocaleString(numberLocale)}</b><i style={{width:`${tokenStats.total?Math.max(4,tokenStats.input/tokenStats.total*100):0}%`}}/></div>
          <div><span>{t("answerOutput")}</span><b>{tokenStats.output.toLocaleString(numberLocale)}</b><i style={{width:`${tokenStats.total?Math.max(4,tokenStats.output/tokenStats.total*100):0}%`}}/></div>
        </div>
        <div className="token-top"><small>{t("costliest")}</small>{tokenStats.top?<><b>{tokenStats.top.title || (tokenStats.top.role==="ai"?t("aiReply"):t("taskLabel"))}</b><span>{tokenStats.topTokens.toLocaleString(numberLocale)} token</span></>:<span>{t("noUsageYet")}</span>}</div>
        {tokenStats.measured>0&&<small className="token-live-note">{t("tokenLiveNote")}</small>}
      </section>
      <section className="savings-dashboard">
        <div className="section-row"><label>{t("savings")}</label><span>{t("savingsLevel")}</span></div>
        {lastSavings ? <>
          <div className="savings-hero"><b>{lastSavings.savedPct.toLocaleString(numberLocale, { maximumFractionDigits: 1 })}%</b><span>{t("savingsLastRequest")}</span></div>
          <div className="savings-grid">
            <div><span>{t("savingsAvoided")}</span><b>{lastSavings.savedTokens.toLocaleString(numberLocale)}</b></div>
            <div><span>{t("savingsPacked")}</span><b>{lastSavings.compactTokens.toLocaleString(numberLocale)}</b></div>
            <div><span>{t("savingsFreeFormat")}</span><b>{lastSavings.freeTokens.toLocaleString(numberLocale)}</b></div>
            {sessionSavings.requests > 1 && <div><span>{t("savingsSession")}</span><b>{sessionSavedPct.toLocaleString(numberLocale, { maximumFractionDigits: 1 })}% · {sessionSavings.savedTokens.toLocaleString(numberLocale)}</b></div>}
          </div>
          <small className="savings-note">{t("savingsEstimateNote")}</small>
        </> : <p className="savings-empty">{t("savingsEmpty")}</p>}
      </section>
    </aside>

    {settingsOpen && <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&setSettingsOpen(false)}><div className="settings-modal" role="dialog" aria-label={t("settingsTitle")}>
      <header><div><small>{t("userwardLocal")}</small><h2>{t("settingsTitle")}</h2><p>{t("settingsLead")}</p></div><button type="button" onClick={()=>setSettingsOpen(false)} aria-label={t("closeSettings")}><Icon name="close"/></button></header>
      <div className="settings-body">
        <section><label>{t("localPrivacy")}</label><div className="security-status local-privacy"><b>✓ {t("noCloud")}</b><span>{t("bindLoopback")}</span><span>{t("historyOnDevice")}</span><span>{rememberKey&&provider?t("keyRemembered"):t("keySession")}</span><span>{t("dataLeavesOnCall")}</span><button type="button" className="clear-local-data" onClick={clearLocalData}>{t("clearLocal")}</button></div></section>
        <section><label>{t("userInterest")}</label><div className="security-status user-interest"><b>✓ {t("userInterestLead")}</b><span>{t("toolBeforeModel")}</span><span>{t("noSilentUpgrade")}</span><span>{t("noUnapprovedSideEffect")}</span><span>{t("noClaimWithoutEvidence")}</span></div></section>
        <section><label>{t("deviceProtection")}</label><div className="security-status"><b>✓ {t("localFirst")}</b><span>{rememberKey&&provider?t("keyRememberedShort"):t("keySessionShort")}</span><span>{t("secretsRedacted")}</span><span>{t("filesNeedConfirm")}</span>{lastRedactions>0&&<em>{t("redactedCount", { count: lastRedactions })}</em>}</div></section>
        <section><label>{t("workspaceFolder")}</label><button className="folder-connect" onClick={chooseFolder}>{folderHandle ? `✓ ${folderHandle.name}` : `＋ ${t("chooseFolderOnDevice")}`}</button>{workspaceError&&<p className="workspace-error">{workspaceError}</p>}<div className="workspace-files">{workspaceFiles.slice(0,40).map(file=><button key={file.path} className={selectedWorkspaceFile===file.path?"active":""} onClick={()=>openWorkspaceFile(file)}>↗ {file.path}</button>)}{folderHandle&&!workspaceFiles.length&&<small>{t("noSupportedFiles")}</small>}</div></section>
        <section><label>{t("aiConfig")}</label><div className="state-card"><span className="pulse"/><div><b>{draft.trim() ? usagePlan.profile : t("autoProfile")}</b><small>{draft.trim() ? usagePlan.tool : t("autoProfileHint")}</small></div></div></section>
        <section><div className="section-row"><label>{t("constraints")}</label><span>0</span></div><div className="memory-item"><i>·</i><p>{t("noConstraints")}</p></div></section>
      </div>
      <footer><span>{t("localOnly")}</span><button type="button" onClick={()=>setSettingsOpen(false)}>{t("close")}</button></footer>
    </div></div>}

    {searchOpen && <div className="overlay" onMouseDown={e => e.target === e.currentTarget && setSearchOpen(false)}><div className="search-panel">
      <div className="search-input"><Icon name="search"/><input ref={searchRef} value={query} onChange={e => {setQuery(e.target.value);setSelected(0)}} placeholder={t("searchPlaceholder")}/><button onClick={()=>setSearchOpen(false)}><Icon name="close"/></button></div>
      <div className="filter-row">{filters.map(f => <button key={f.value} className={filter === f.value ? "active" : ""} onClick={()=>{setFilter(f.value);setSelected(0)}}>{f.label}</button>)}</div>
      <div className="results"><div className="results-head"><span>{query ? `${results.length} ${t("resultCount")}` : t("recentContent")}</span><small>{t("searchSelectHint")}</small></div>
        {results.length ? results.map((r, i) => <button key={r.id} className={i === selected ? "result selected" : "result"} onMouseEnter={()=>setSelected(i)} onClick={()=>jumpTo(r.id)}><span className={`result-icon ${r.kind}`}>{r.kind === "decision" ? "◆" : r.kind === "task" ? "✓" : r.kind === "file" ? "↗" : r.kind === "result" ? "●" : r.role === "user" ? "HT" : "U"}</span><span className="result-copy"><span><b>{highlight(r.title || (r.role === "user" ? t("you") : "Userward"), query)}</b><time>{localizeKnownTime(r.time, t)}</time></span><p>{highlight(r.text, query)}</p><small>{r.meta || r.kind}</small></span><Icon name="chevron"/></button>) : <div className="empty"><Icon name="search"/><b>{t("searchEmpty")}</b><span>{t("searchEmptyHint")}</span></div>}
      </div><footer><span><kbd>↵</kbd> {t("openInTimeline")}</span><span><kbd>Esc</kbd> {t("close")}</span><button>{t("askAiAboutHistory")}</button></footer>
    </div></div>}
    {providersOpen && <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&setProvidersOpen(false)}><div className="provider-modal"><header><div><small>{t("connectTitle")}</small><h2>{t("connectHeading")}</h2><p>{t("connectLead")}</p></div><button onClick={()=>setProvidersOpen(false)}><Icon name="close"/></button></header><div className="provider-list"><div className="router-callout"><b>{t("recommendedOpenRouter")}</b><span>{t("openRouterOneKey")}</span><button onClick={()=>selectCredentialProvider("OpenRouter")}>{t("useOpenRouter")}</button></div>{[
      ["OpenAI", t("gptModels"), t("apiKeyMethod")], ["Anthropic", t("claudeModels"), t("apiKeyMethod")], ["Google", t("geminiModels"), t("apiKeyMethod")],
      ["DeepSeek", t("deepseekModels"), t("apiKeyMethod")], ["Qwen", t("qwenStudio"), t("dashScopeKey")],
      ["Kimi", t("kimiModels"), t("apiKeyMethod")], ["OpenRouter", t("manyVendorsOneKey"), t("recommended")]
    ].map(([name,desc,method])=><div className={`provider-row ${credentialProvider===name?"chosen":""}`} key={name}><span className="provider-logo">{name[0]}</span><div><b>{name}</b><small>{desc} · {method}</small></div><button onClick={()=>selectCredentialProvider(name)}>{provider===name?t("reconnect"):t("chooseProvider")}</button></div>)}<div className={`provider-row local-row ${credentialProvider==="Ollama"?"chosen":""}`}><span className="provider-logo">O</span><div><b>{t("ollamaOnDevice")}</b><small>{t("ollamaNoKey")}</small></div><button onClick={()=>selectCredentialProvider("Ollama")}>{provider==="Ollama"?t("reconnect"):t("setupProvider")}</button></div><div ref={providerSetupRef} className="provider-setup-anchor"/>{credentialProvider==="Ollama"&&<div className="key-guide local-model-guide"><div><b>{t("installQwen3")}</b><ol><li>{t("ollamaStep1")}</li><li>{t("ollamaStep2")}</li><li>{t("ollamaStep3")}</li></ol></div><div className="key-guide-actions"><a href="https://ollama.com/download" target="_blank" rel="noreferrer">{t("downloadOllama")} ↗</a><a href="https://ollama.com/library/qwen3" target="_blank" rel="noreferrer">{t("viewQwen")} ↗</a></div><small>{t("ollamaLoopback")}</small></div>}{providerGuide && <div className="key-guide"><div><b>{t("getKeyIn3", { provider: credentialProvider })}</b><ol><li>{t("keyGuide1")}</li><li>{t("keyGuide2")}</li><li>{t("keyGuide3")}</li></ol></div><div className="key-guide-actions"><a href={providerGuide.keyUrl} target="_blank" rel="noreferrer">{providerGuide.keyLabel || t("openKeyPage")} ↗</a><a href={providerGuide.billingUrl} target="_blank" rel="noreferrer">{t("billingCredit")} ↗</a></div><small>{providerGuide.note} {t("neverShareKey")}</small></div>}{credentialProvider&&<div className="credential-form">{credentialProvider==="Ollama"?<><label>{t("connectOllamaHere")}</label><div><button onClick={connectProvider} disabled={connecting}>{connecting?t("findingModels"):t("findLocalModels")}</button></div><small>{t("noKeyOllama")}</small></>:<><label>{t("apiKeyOf", { provider: credentialProvider })}</label><div><input ref={apiKeyInputRef} type="password" value={apiKey} onChange={e=>{setApiKey(e.target.value);setAvailableModels([])}} placeholder={t("pasteKeyHere")} autoComplete="off"/><button onClick={connectProvider} disabled={!apiKey.trim()||connecting}>{connecting?t("checkingKey"):t("checkKey")}</button></div><small>{rememberKey?t("keyStoredLocal"):t("keyTabOnly")}</small></>}<label className="remember-key-toggle"><input type="checkbox" checked={rememberKey} onChange={e=>setRememberKey(e.target.checked)}/> {t("rememberKey")}</label>{availableModels.length>0&&<div className="model-picker"><label>{t("chooseModel")}</label><select value={model} onChange={e=>setModel(e.target.value)}>{availableModels.map(item=><option value={item} key={item}>{item}</option>)}</select><button onClick={saveProvider}>{t("saveConnect")}</button></div>}{connectionError&&<p>{connectionError}</p>}</div>}</div><footer><span>{t("cloudVsLocal")}</span><button onClick={()=>setProvidersOpen(false)}>{t("close")}</button></footer></div></div>}
    {newProjectOpen&&<div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&setNewProjectOpen(false)}><div className="new-project-modal"><h2>{t("createProjectTitle")}</h2><p>{t("createProjectLead")}</p><label>{t("projectName")}</label><input autoFocus value={newProjectName} onChange={e=>setNewProjectName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&createProject()} placeholder={t("projectNameExample")}/><div><button onClick={()=>setNewProjectOpen(false)}>{t("cancel")}</button><button className="primary" onClick={createProject} disabled={!newProjectName.trim()}>{t("create")}</button></div></div></div>}
  </main>;
}
