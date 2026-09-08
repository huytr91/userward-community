type Provider = "OpenAI" | "Anthropic" | "Google" | "DeepSeek" | "Qwen" | "Kimi" | "OpenRouter" | "Ollama";

const compatibleBases: Partial<Record<Provider, string>> = {
  DeepSeek: "https://api.deepseek.com",
  Qwen: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  Kimi: "https://api.moonshot.ai/v1",
  OpenRouter: "https://openrouter.ai/api/v1",
};

const json = (body: unknown, status = 200) => Response.json(body, { status });
const providers = new Set<Provider>(["OpenAI", "Anthropic", "Google", "DeepSeek", "Qwen", "Kimi", "OpenRouter", "Ollama"]);
const providerFetch = (url: string, init: RequestInit = {}, timeoutMs = 15_000) =>
  fetchWithTimeout(url, init, timeoutMs);
const isInteractiveTextModel = (id: string) => Boolean(id) && !/(?:^|[/:._-])(?:batch|embedding|embed|moderation|rerank|audio|realtime|transcrib|speech|tts|image|vision-only)(?:$|[/:._-])/i.test(id);

export async function POST(request: Request) {
  let requestedProvider: Provider | undefined;
  try {
    const hostname = new URL(request.url).hostname;
    if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) return Response.json({ error: "Userward Local chỉ nhận yêu cầu từ thiết bị này." }, { status: 403 });
    const { provider, apiKey } = await request.json() as { provider?: Provider; apiKey?: string };
    requestedProvider = provider;
    if (!provider || !providers.has(provider) || (provider !== "Ollama" && !apiKey?.trim())) return json({ error: "Provider hoặc API key không hợp lệ." }, 400);
    const cleanKey = apiKey?.trim() || "";

    let response: Response;
    if (provider === "Ollama") {
      response = await fetchOllamaTags();
    } else if (provider === "OpenAI") {
      response = await providerFetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${cleanKey}` } });
    } else if (provider === "Anthropic") {
      response = await providerFetch("https://api.anthropic.com/v1/models?limit=100", { headers: { "x-api-key": cleanKey, "anthropic-version": "2023-06-01" } });
    } else if (provider === "Google") {
      response = await providerFetch("https://generativelanguage.googleapis.com/v1beta/models", { headers: { "x-goog-api-key": cleanKey } });
    } else if (provider === "OpenRouter") {
      const keyResponse = await providerFetch("https://openrouter.ai/api/v1/key", {
        headers: { Authorization: `Bearer ${cleanKey}` },
      });
      const keyRaw = await keyResponse.text();
      let keyData: { error?: { message?: string } } = {};
      try { keyData = keyRaw ? JSON.parse(keyRaw) : {}; }
      catch {
        return json({ error: `OpenRouter đang trả phản hồi không hợp lệ (HTTP ${keyResponse.status || 502}). Hãy thử lại sau; chưa thể kết luận API key sai.` }, 502);
      }
      if (!keyResponse.ok) {
        const message = keyResponse.status === 401
          ? "API key OpenRouter không hợp lệ, đã hết hạn hoặc bị vô hiệu hóa. Hãy tạo key mới rồi thử lại."
          : keyData.error?.message || `OpenRouter từ chối kiểm tra key (HTTP ${keyResponse.status}).`;
        return json({ error: message }, keyResponse.status === 429 ? 429 : keyResponse.status === 401 ? 401 : 502);
      }
      response = await providerFetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${cleanKey}` },
      });
    } else if (compatibleBases[provider]) {
      response = await providerFetch(`${compatibleBases[provider]}/models`, { headers: { Authorization: `Bearer ${cleanKey}` } });
    } else return json({ error: "Provider chưa được hỗ trợ." }, 400);

    const rawResponse = await response.text();
    let data: { data?: Array<{ id?: string; architecture?: { input_modalities?: string[] } }>; models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>; error?: { message?: string } } = {};
    try { data = rawResponse ? JSON.parse(rawResponse) : {}; }
    catch { return json({ error: `${provider} đang gặp lỗi dịch vụ tạm thời (HTTP ${response.status || 502}). Hãy thử lại sau.` }, 502); }
    if (!response.ok) {
      const providerMessage = data.error?.message || `${provider} từ chối yêu cầu (HTTP ${response.status}).`;
      if (provider === "Ollama") return json({ error: providerMessage, code: "ollama_http_error" }, response.status >= 500 ? 502 : response.status);
      return json({ error: data.error?.message || "API key không hợp lệ hoặc tài khoản chưa có quyền truy cập." }, response.status === 429 ? 429 : 401);
    }

    let model = "";
    if (provider === "Ollama") {
      const ids = (data.models || []).map(x => x.name || "").filter(Boolean);
      model = ids.find(x => /qwen/i.test(x)) || ids[0] || "";
    } else if (provider === "OpenAI") {
      const ids = (data.data || []).map(x => x.id || "").filter(isInteractiveTextModel);
      model = ["gpt-5.2", "gpt-5.1", "gpt-5", "gpt-4.1-mini"].find(x => ids.includes(x)) || ids.find(x => /^gpt-(?!.*(?:audio|realtime|transcribe|image|search))/.test(x)) || "";
    } else if (provider === "Anthropic") {
      model = (data.data || []).map(x => x.id || "").find(x => x.includes("sonnet")) || data.data?.[0]?.id || "";
    } else if (provider === "Google") {
      model = (data.models || []).find(x => x.supportedGenerationMethods?.includes("generateContent") && x.name?.includes("flash"))?.name?.replace("models/", "") || "";
    } else {
      const ids = (data.data || []).map(x => x.id || "").filter(isInteractiveTextModel);
      const preferred: Record<string, string[]> = {
        DeepSeek: ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-chat"],
        Qwen: ["qwen-plus", "qwen-turbo"],
        Kimi: ["kimi-k2.5", "kimi-k2", "moonshot-v1-auto"],
        OpenRouter: ["openrouter/auto"],
      };
      model = preferred[provider]?.find(x => ids.includes(x)) || ids.find(x => /deepseek|qwen|kimi|moonshot|:free/.test(x)) || ids[0] || "";
    }
    if (!model) {
      if (provider === "Ollama") return json(ollamaNoModelsError, ollamaNoModelsError.status);
      return json({ error: "Đăng nhập hợp lệ nhưng không tìm thấy model tạo văn bản khả dụng." }, 422);
    }
    const models = provider === "Ollama"
      ? (data.models || []).map(x => x.name || "").filter(Boolean)
      : provider === "Google"
      ? (data.models || []).filter(x => x.supportedGenerationMethods?.includes("generateContent")).map(x => x.name?.replace("models/", "") || "").filter(Boolean)
      : (data.data || []).map(x => x.id || "").filter(isInteractiveTextModel);
    const capabilities = models.slice(0, 300).map(id => {
      const metadata = data.data?.find(item => item.id === id);
      return inferModelCapability(provider, id, metadata?.architecture?.input_modalities || []);
    });
    return json({ ok: true, provider, model, models: models.slice(0, 300), capabilities });
  } catch (error) {
    const classified = classifyProviderFetchError(error, requestedProvider);
    return json({ error: classified.error, code: classified.code }, classified.status);
  }
}

async function fetchOllamaTags() {
  let lastError: unknown;
  for (const url of ["http://127.0.0.1:11434/api/tags", "http://localhost:11434/api/tags"]) {
    try {
      return await providerFetch(url, {}, 15_000);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
import { inferModelCapability } from "../../../lib/model-capabilities.ts";
import { classifyProviderFetchError, fetchWithTimeout, ollamaNoModelsError } from "../../../lib/provider-connect-errors.ts";
