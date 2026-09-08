import { isOpenRouterPrivacyRestriction } from "./provider-connect-errors.ts";

export type OpenRouterAttempt = {
  model: string;
  provider?: { allow_fallbacks: true };
  models?: string[];
};

/** Never attach zdr / data_collection deny / provider allow-lists that shrink the endpoint set. */
export function openRouterFallbackModel(model: string, budgetMode?: string): string {
  if (budgetMode === "free-first") return "openrouter/free";
  return "openrouter/auto";
}

export function buildOpenRouterAttempts(model: string, budgetMode?: string): OpenRouterAttempt[] {
  const chosen = model.trim() || "openrouter/auto";
  const fallback = openRouterFallbackModel(chosen, budgetMode);
  const attempts: OpenRouterAttempt[] = [{
    model: chosen,
    provider: { allow_fallbacks: true },
    ...(fallback !== chosen ? { models: [fallback] } : {}),
  }];
  if (fallback !== chosen) attempts.push({ model: fallback, provider: { allow_fallbacks: true } });
  return attempts;
}

export function openRouterPayloadExtras(attempt: OpenRouterAttempt): Record<string, unknown> {
  return {
    model: attempt.model,
    ...(attempt.provider ? { provider: attempt.provider } : {}),
    ...(attempt.models?.length ? { models: attempt.models } : {}),
  };
}

export function openRouterErrorMessage(data: Record<string, unknown>): string {
  const error = data.error && typeof data.error === "object" ? data.error as Record<string, unknown> : undefined;
  const message = typeof error?.message === "string" ? error.message : typeof data.error === "string" ? data.error : "";
  const code = error?.code != null ? String(error.code) : "";
  const metadata = error?.metadata && typeof error.metadata === "object" ? JSON.stringify(error.metadata) : "";
  return [message, code, metadata].filter(Boolean).join(" ");
}

export function shouldRetryOpenRouterPrivacy(status: number, message: string): boolean {
  if (status === 401 || status === 402) return false;
  return isOpenRouterPrivacyRestriction(message);
}
