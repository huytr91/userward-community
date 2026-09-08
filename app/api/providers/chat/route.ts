export type Provider = "OpenAI" | "Anthropic" | "Google" | "DeepSeek" | "Qwen" | "Kimi" | "OpenRouter" | "Ollama";
export type ChatMessage = { role: "user" | "assistant"; content: string };
type Attachment = { name: string; dataUrl: string; mime: string };
type ChatRequest = {
  provider?: Provider;
  apiKey?: string;
  model?: string;
  messages?: ChatMessage[];
  prompt?: string;
  attachments?: Attachment[];
  maxOutputTokens?: number;
  executionMode?: "analyze" | "execute";
  budgetMode?: "free-first" | "economy" | "balanced" | "quality";
  stream?: boolean;
};

export const MAX_REQUEST_BYTES = 16 * 1024 * 1024;
const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 500_000;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const compatibleBases: Partial<Record<Provider, string>> = {
  DeepSeek: "https://api.deepseek.com",
  Qwen: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  Kimi: "https://api.moonshot.ai/v1",
  OpenRouter: "https://openrouter.ai/api/v1",
};
const providers = new Set<Provider>(["OpenAI", "Anthropic", "Google", "DeepSeek", "Qwen", "Kimi", "OpenRouter", "Ollama"]);
const json = (body: unknown, status = 200) => Response.json(body, { status });
const byteLength = (value: string) => new TextEncoder().encode(value).byteLength;

function parseMessages(body: ChatRequest): ChatMessage[] | null {
  const source = Array.isArray(body.messages)
    ? body.messages
    : typeof body.prompt === "string"
      ? [{ role: "user" as const, content: body.prompt }]
      : [];
  if (!source.length || source.length > MAX_MESSAGES) return null;
  const messages: ChatMessage[] = [];
  for (const item of source) {
    if (!item || (item.role !== "user" && item.role !== "assistant") || typeof item.content !== "string") return null;
    const content = item.content.trim();
    if (!content || content.length > MAX_MESSAGE_CHARS) return null;
    messages.push({ role: item.role, content });
  }
  return messages.at(-1)?.role === "user" ? messages : null;
}

function validAttachments(value: unknown): value is Attachment[] {
  if (!Array.isArray(value) || value.length > 5) return false;
  return value.every(file => {
    if (!file || typeof file !== "object") return false;
    const item = file as Partial<Attachment>;
    return typeof item.name === "string" && item.name.length > 0 && item.name.length <= 255
      && typeof item.mime === "string" && item.mime.length <= 100
      && typeof item.dataUrl === "string" && item.dataUrl.startsWith("data:")
      && byteLength(item.dataUrl) <= MAX_ATTACHMENT_BYTES;
  });
}

function extractProviderText(data: Record<string, unknown>, provider: Provider): string {
  if (provider === "Ollama") {
    const message = data.message as { content?: unknown } | undefined;
    return typeof message?.content === "string" ? message.content : typeof data.response === "string" ? data.response : "";
  }
  if (provider === "OpenAI") {
    if (typeof data.output_text === "string") return data.output_text;
    const output = Array.isArray(data.output) ? data.output : [];
    return output.flatMap(item => {
      if (!item || typeof item !== "object") return [];
      const content = (item as { content?: unknown }).content;
      return Array.isArray(content) ? content : [];
    }).map(part => part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string" ? String((part as { text: string }).text) : "").join("");
  }
  if (provider === "Anthropic") {
    return (Array.isArray(data.content) ? data.content : []).map(part => part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string" ? String((part as { text: string }).text) : "").join("");
  }
  if (provider === "Google") {
    const candidates = Array.isArray(data.candidates) ? data.candidates : [];
    const content = candidates[0] && typeof candidates[0] === "object" ? (candidates[0] as { content?: { parts?: unknown[] } }).content : undefined;
    return (Array.isArray(content?.parts) ? content.parts : []).map(part => part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string" ? String((part as { text: string }).text) : "").join("");
  }
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const first = choices[0] && typeof choices[0] === "object" ? choices[0] as { message?: { content?: unknown }; text?: unknown } : undefined;
  const content = first?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(part => typeof part === "string" ? part : part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string" ? String((part as { text: string }).text) : "").join("\n");
  return typeof first?.text === "string" ? first.text : "";
}

function streamDelta(data: Record<string, unknown>, provider: Provider): string {
  if (provider === "OpenAI") return data.type === "response.output_text.delta" && typeof data.delta === "string" ? data.delta : "";
  if (provider === "Anthropic") return data.type === "content_block_delta" && data.delta && typeof data.delta === "object" && typeof (data.delta as { text?: unknown }).text === "string" ? String((data.delta as { text: string }).text) : "";
  if (provider === "Ollama") return data.message && typeof data.message === "object" && typeof (data.message as { content?: unknown }).content === "string" ? String((data.message as { content: string }).content) : "";
  if (provider === "Google") return extractProviderText(data, provider);
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const delta = choices[0] && typeof choices[0] === "object" ? (choices[0] as { delta?: { content?: unknown } }).delta : undefined;
  return typeof delta?.content === "string" ? delta.content : "";
}

function readUpstreamWithIdleTimeout<T>(promise: Promise<T>, idleMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }));
    }, idleMs);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}

function proxyProviderStream(response: Response, provider: Provider, model: string, onEnd?: () => void): Response {
  if (!response.body) return json({ error: `${provider} không cung cấp stream.` }, 502);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  let ended = false;
  const finish = () => { if (ended) return; ended = true; onEnd?.(); };
  let lastUsage: ReturnType<typeof normalizeProviderUsage>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`${JSON.stringify({ started: true, selectedModel: model })}\n`));
      void (async () => {
        let lastActivity = Date.now();
        try {
          while (true) {
            const idleBudget = STREAM_IDLE_TIMEOUT_MS - (Date.now() - lastActivity);
            if (idleBudget <= 0) {
              const classified = classifyProviderFetchError(Object.assign(new Error("stream idle timeout"), { name: "TimeoutError" }), provider);
              controller.enqueue(encoder.encode(`${JSON.stringify({ error: classified.error, code: classified.code })}\n`));
              break;
            }
            const { done, value } = await readUpstreamWithIdleTimeout(reader.read(), idleBudget);
            lastActivity = Date.now();
            if (done) {
              if (buffer.trim()) processLine(buffer, controller);
              if (lastUsage) controller.enqueue(encoder.encode(`${JSON.stringify({ usage: lastUsage })}\n`));
              controller.enqueue(encoder.encode(`${JSON.stringify({ done: true, selectedModel: model })}\n`));
              break;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split(/\r?\n/); buffer = lines.pop() || "";
            for (const line of lines) processLine(line, controller);
          }
        } catch (error) {
          const classified = classifyProviderFetchError(error, provider);
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify({ error: classified.error, code: classified.code })}\n`));
          } catch { /* stream already closed */ }
        } finally {
          finish();
          try { controller.close(); } catch { /* already closed */ }
          void reader.cancel().catch(() => undefined);
        }
      })();
    },
    cancel() { finish(); void reader.cancel().catch(() => undefined); },
  });
  function processLine(line: string, controller: ReadableStreamDefaultController<Uint8Array>) {
    const payload = line.startsWith("data:") ? line.slice(5).trim() : line.trim();
    if (!payload || payload === "[DONE]" || payload.startsWith("event:")) return;
    try {
      const parsed = JSON.parse(payload) as Record<string, unknown>;
      const usage = normalizeProviderUsage(parsed);
      if (usage) {
        lastUsage = usage;
        controller.enqueue(encoder.encode(`${JSON.stringify({ usage })}\n`));
      }
      const delta = streamDelta(parsed, provider);
      if (delta) controller.enqueue(encoder.encode(`${JSON.stringify({ delta })}\n`));
    } catch { /* Ignore keep-alive and non-JSON event lines. */ }
  }
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  let provider: Provider | undefined;
  let abort: ReturnType<typeof createProviderAbort> | undefined;
  try {
    const hostname = new URL(request.url).hostname;
    if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) return json({ error: "Userward Local chỉ nhận yêu cầu từ thiết bị này." }, 403);
    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > MAX_REQUEST_BYTES) return json({ error: "Yêu cầu vượt giới hạn 16 MiB của kết nối provider." }, 413);
    const rawRequest = await request.text();
    if (byteLength(rawRequest) > MAX_REQUEST_BYTES) return json({ error: "Yêu cầu vượt giới hạn 16 MiB của kết nối provider." }, 413);
    let body: ChatRequest;
    try { body = JSON.parse(rawRequest) as ChatRequest; }
    catch { return json({ error: "Nội dung yêu cầu không phải JSON hợp lệ." }, 400); }

    provider = body.provider;
    const messages = parseMessages(body);
    const attachments = body.attachments ?? [];
    const model = body.model?.trim() || "";
    const cleanKey = body.apiKey?.trim() || "";
    const executionMode = body.executionMode === "execute" ? "execute" : "analyze";
    const outputLimit = Math.min(Math.max(Number(body.maxOutputTokens) || 1800, 200), 8000);
    if (!provider || !providers.has(provider) || (provider !== "Ollama" && !cleanKey) || !model || model.length > 200 || !messages) {
      return json({ error: "Provider, model hoặc nội dung hội thoại không hợp lệ." }, 400);
    }
    if (!validAttachments(attachments)) return json({ error: "File đính kèm không hợp lệ hoặc vượt giới hạn an toàn." }, 413);
    if (attachments.length && provider !== "OpenRouter") return json({ error: "PDF và ảnh hiện chỉ được gửi trực tiếp qua OpenRouter." }, 400);
    if (body.budgetMode === "free-first" && provider !== "Ollama" && !(provider === "OpenRouter" && model === "openrouter/free")) {
      return json({ error: "Free-first không cho phép tự chuyển sang model trả phí." }, 409);
    }
    const capabilityError = validateModelRequest(inferModelCapability(provider, model), attachments, executionMode === "execute");
    if (capabilityError) return json({ error: capabilityError }, 422);
    abort = createProviderAbort(PROVIDER_TOTAL_TIMEOUT_MS, request.signal);
    const callProvider = (url: string, init: RequestInit = {}) => fetch(url, { ...init, signal: abort!.signal, cache: "no-store" });

    let response: Response;
    if (provider === "Ollama") {
      response = await callProvider("http://127.0.0.1:11434/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, stream: Boolean(body.stream), think: false, messages, options: { num_predict: outputLimit } }) });
    } else if (provider === "OpenAI") {
      response = await callProvider("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${cleanKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, input: messages, max_output_tokens: outputLimit, store: false, stream: Boolean(body.stream) }) });
    } else if (provider === "Anthropic") {
      response = await callProvider("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": cleanKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }, body: JSON.stringify({ model, max_tokens: outputLimit, messages, stream: Boolean(body.stream) }) });
    } else if (provider === "Google") {
      const contents = messages.map(item => ({ role: item.role === "assistant" ? "model" : "user", parts: [{ text: item.content }] }));
      const googleMethod = body.stream ? "streamGenerateContent?alt=sse" : "generateContent";
      response = await callProvider(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${googleMethod}`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": cleanKey }, body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: outputLimit } }) });
    } else {
      const compatibleMessages: Array<{ role: ChatMessage["role"]; content: unknown }> = messages.map(item => ({ ...item }));
      if (provider === "OpenRouter" && attachments.length) {
        const last = compatibleMessages.at(-1)!;
        last.content = [
          { type: "text", text: String(last.content) },
          ...attachments.map(file => file.mime.startsWith("image/") ? { type: "image_url", image_url: { url: file.dataUrl } } : { type: "file", file: { filename: file.name, file_data: file.dataUrl } }),
        ];
      }
      const base = compatibleBases[provider];
      if (!base) { abort.dispose(); return json({ error: "Provider chưa được hỗ trợ." }, 400); }
      const compatibleHeaders = {
        Authorization: `Bearer ${cleanKey}`,
        "Content-Type": "application/json",
        ...(provider === "OpenRouter" ? { "HTTP-Referer": "http://127.0.0.1:3001", "X-OpenRouter-Title": "Userward Local" } : {}),
      };
      if (provider === "OpenRouter") {
        const attempts = buildOpenRouterAttempts(model, body.budgetMode);
        let lastStatus = 0;
        let lastMessage = "";
        let chosenModel = model;
        for (let i = 0; i < attempts.length; i++) {
          const attempt = attempts[i];
          chosenModel = attempt.model;
          const executeExtras = attempt.model !== "openrouter/free" && executionMode === "execute"
            ? { reasoning: { effort: "low", exclude: true }, response_format: { type: "json_object" } }
            : {};
          const attemptAbort = body.stream && i < attempts.length - 1
            ? createProviderAbort(OPENROUTER_STREAM_ATTEMPT_MS, abort.signal)
            : undefined;
          try {
            response = await fetch(`${base}/chat/completions`, {
              method: "POST",
              headers: compatibleHeaders,
              body: JSON.stringify({
                messages: compatibleMessages,
                max_tokens: outputLimit,
                stream: Boolean(body.stream),
                ...(body.stream ? { stream_options: { include_usage: true } } : {}),
                ...openRouterPayloadExtras(attempt),
                ...executeExtras,
              }),
              signal: attemptAbort?.signal ?? abort.signal,
              cache: "no-store",
            });
          } catch (error) {
            attemptAbort?.dispose();
            if (body.stream && i < attempts.length - 1 && isTimeoutError(error)) continue;
            throw error;
          }
          attemptAbort?.dispose();
          if (response.ok) {
            if (body.stream) return proxyProviderStream(response, provider, attempt.model, abort.dispose);
            break;
          }
          const rawError = await response.text();
          let errorData: Record<string, unknown> = {};
          try { errorData = rawError ? JSON.parse(rawError) as Record<string, unknown> : {}; }
          catch { errorData = { error: rawError }; }
          lastStatus = response.status;
          lastMessage = openRouterErrorMessage(errorData) || rawError;
          if (!shouldRetryOpenRouterPrivacy(lastStatus, lastMessage) || i === attempts.length - 1) {
            const mapped = mapOpenRouterHttpError(lastStatus, lastMessage);
            abort.dispose();
            if (mapped.code === "openrouter_privacy") {
              return json({ text: mapped.error, code: mapped.code, warning: "openrouter_privacy", selectedModel: chosenModel }, 200);
            }
            return json({ error: mapped.error, ...(mapped.code ? { code: mapped.code } : {}) }, lastStatus);
          }
        }
      } else {
        response = await callProvider(`${base}/chat/completions`, { method: "POST", headers: compatibleHeaders, body: JSON.stringify({ model, messages: compatibleMessages, max_tokens: outputLimit, stream: Boolean(body.stream), ...(body.stream ? { stream_options: { include_usage: true } } : {}) }) });
      }
    }

    if (body.stream && response.ok) return proxyProviderStream(response, provider, model, abort.dispose);

    const rawResponse = await response.text();
    abort.dispose();
    let data: Record<string, unknown>;
    try { data = rawResponse ? JSON.parse(rawResponse) as Record<string, unknown> : {}; }
    catch { return json({ error: `${provider} trả phản hồi không hợp lệ (HTTP ${response.status || 502}).` }, 502); }
    if (!response.ok) {
      const error = data.error && typeof data.error === "object" ? data.error as { message?: unknown } : undefined;
      const providerMessage = typeof error?.message === "string" ? error.message : "";
      const mapped = provider === "OpenRouter"
        ? mapOpenRouterHttpError(response.status, providerMessage)
        : { error: providerMessage || `${provider} từ chối yêu cầu (HTTP ${response.status}).` };
      return json({ error: mapped.error, ...(mapped.code ? { code: mapped.code } : {}) }, response.status);
    }
    const text = extractProviderText(data, provider).trim();
    if (!text) return json({ error: `${provider} không tạo nội dung cuối. Hãy thử lại hoặc đổi model.` }, 502);
    const usage = normalizeProviderUsage(data);
    return json({ text, usage, selectedModel: typeof data.model === "string" ? data.model : model });
  } catch (error) {
    abort?.dispose();
    const classified = classifyProviderFetchError(error, provider);
    return json({ error: classified.error, code: classified.code }, classified.status);
  }
}
import { inferModelCapability, validateModelRequest } from "../../../lib/model-capabilities.ts";
import { classifyProviderFetchError, createProviderAbort, isTimeoutError, mapOpenRouterHttpError, OPENROUTER_STREAM_ATTEMPT_MS, PROVIDER_TOTAL_TIMEOUT_MS, STREAM_IDLE_TIMEOUT_MS } from "../../../lib/provider-connect-errors.ts";
import { buildOpenRouterAttempts, openRouterErrorMessage, openRouterPayloadExtras, shouldRetryOpenRouterPrivacy } from "../../../lib/openrouter-routing.ts";
import { normalizeProviderUsage } from "../../../lib/chat-contract.ts";
