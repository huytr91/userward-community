export type ProviderConnectCode =
  | "ollama_not_running"
  | "ollama_timeout"
  | "ollama_no_models"
  | "ollama_http_error"
  | "provider_timeout"
  | "provider_unreachable"
  | "openrouter_network"
  | "openrouter_unauthorized"
  | "openrouter_credits"
  | "openrouter_privacy"
  | "openrouter_rate_limit";

export type ClassifiedProviderError = {
  status: number;
  error: string;
  code: ProviderConnectCode;
};

/** Hard cap for one chat/test provider round-trip (retries + stream included). */
export const PROVIDER_TOTAL_TIMEOUT_MS = 60_000;
/** Abort an idle upstream stream when no bytes arrive for this long. */
export const STREAM_IDLE_TIMEOUT_MS = 30_000;
/** Give a hanging OpenRouter stream attempt this long before trying the next fallback. */
export const OPENROUTER_STREAM_ATTEMPT_MS = 10_000;

const timeoutPattern = /timeout|timed out|aborted|quá lâu/i;
const connectionPattern = /econnrefused|connection refused|failed to fetch|networkconnectionlost|network connection|connect\(\) failed|connection reset|enotfound|ehostunreach|econnreset|socket hang up|network error/i;
const openRouterPrivacyPattern = /openrouter_privacy|guardrail restrictions and data policy|matching your data policy|settings\/privacy|privacy_restricted|data_policy:zdr|no endpoints available matching/i;

export function isTimeoutError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : typeof error === "object" && error && "name" in error ? String((error as { name?: unknown }).name || "") : "";
  const message = error instanceof Error ? error.message : String(error || "");
  return name === "TimeoutError" || name === "AbortError" || timeoutPattern.test(message);
}

export function isOpenRouterPrivacyRestriction(message: string): boolean {
  return openRouterPrivacyPattern.test(message);
}

export function mapOpenRouterHttpError(status: number, providerMessage: string): { error: string; code?: ProviderConnectCode } {
  if (status === 401) return { error: "OpenRouter không chấp nhận API key này.", code: "openrouter_unauthorized" };
  if (status === 402) return { error: "Tài khoản OpenRouter không đủ credit cho yêu cầu này.", code: "openrouter_credits" };
  if (isOpenRouterPrivacyRestriction(providerMessage)) {
    return {
      error: "OpenRouter không tìm được endpoint khớp chính sách dữ liệu/guardrail của tài khoản. Đây không phải hết credit. Hãy mở https://openrouter.ai/settings/privacy hoặc chọn model khác.",
      code: "openrouter_privacy",
    };
  }
  if (status === 429) return { error: "OpenRouter đang giới hạn tần suất hoặc hạn mức đã hết.", code: "openrouter_rate_limit" };
  return { error: providerMessage || `OpenRouter từ chối yêu cầu (HTTP ${status}).` };
}

/** AbortController + timer instead of AbortSignal.timeout(), which throws a DOMException vinext rethrows and exits Node. */
export function createProviderAbort(timeoutMs: number, userSignal?: AbortSignal) {
  const controller = new AbortController();
  const timeoutError = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
  const onUserAbort = () => {
    try { controller.abort(userSignal?.reason); } catch { /* already aborted */ }
  };
  if (userSignal) {
    if (userSignal.aborted) controller.abort(userSignal.reason);
    else userSignal.addEventListener("abort", onUserAbort, { once: true });
  }
  const timer = setTimeout(() => {
    try { controller.abort(timeoutError); } catch { /* already aborted */ }
  }, timeoutMs);
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      userSignal?.removeEventListener("abort", onUserAbort);
    },
  };
}

export function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = PROVIDER_TOTAL_TIMEOUT_MS): Promise<Response> {
  const abort = createProviderAbort(timeoutMs, init.signal);
  return fetch(url, { ...init, signal: abort.signal, cache: "no-store" }).finally(() => abort.dispose());
}

export function isConnectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return connectionPattern.test(message);
}

export const ollamaNoModelsError: ClassifiedProviderError = {
  status: 422,
  code: "ollama_no_models",
  error: "Ollama đang chạy nhưng chưa có model. Hãy chạy ollama run qwen3:8b (hoặc model khác) rồi nhấn Tìm model trên máy.",
};

export function classifyProviderFetchError(error: unknown, provider?: string): ClassifiedProviderError {
  const timedOut = isTimeoutError(error);
  if (provider === "Ollama") {
    if (timedOut) {
      return {
        status: 504,
        code: "ollama_timeout",
        error: "Ollama phản hồi quá lâu tại 127.0.0.1:11434. Hãy thử lại sau khi model đã tải xong.",
      };
    }
    return {
      status: 503,
      code: "ollama_not_running",
      error: "Ollama chưa chạy trên máy này (127.0.0.1:11434). Hãy mở ứng dụng Ollama, chạy ollama run qwen3:8b hoặc model đã cài, rồi thử lại.",
    };
  }
  if (provider === "OpenRouter") {
    return {
      status: timedOut ? 504 : 502,
      code: timedOut ? "provider_timeout" : "openrouter_network",
      error: timedOut
        ? "OpenRouter phản hồi quá lâu nên Userward đã dừng yêu cầu."
        : "Máy này chưa kết nối được tới OpenRouter. Hãy kiểm tra Internet, DNS, firewall, VPN hoặc proxy rồi thử lại; lỗi này chưa có nghĩa API key sai.",
    };
  }
  if (timedOut) {
    return {
      status: 504,
      code: "provider_timeout",
      error: "Provider phản hồi quá lâu nên Userward đã dừng yêu cầu.",
    };
  }
  return {
    status: 503,
    code: "provider_unreachable",
    error: `Không thể kết nối tới ${provider || "provider"}. Hãy kiểm tra mạng, firewall hoặc proxy.`,
  };
}
