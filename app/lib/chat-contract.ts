export type ConversationMessage = { role: "user" | "assistant"; content: string };
export type SafePatchFile = { path: string; content: string; operation: "create" | "update" };
export type SafePendingPatch = { files: SafePatchFile[]; summary: string };

const MAX_HISTORY_MESSAGES = 11;
const MAX_HISTORY_CHARS = 120_000;
const MAX_PATCH_FILES = 40;
const MAX_PATCH_FILE_CHARS = 1_000_000;
const MAX_PATCH_TOTAL_CHARS = 4_000_000;
const SENSITIVE_FILE = /(^|\/)(?:\.env(?:\..*)?|\.npmrc|\.pypirc|id_(?:rsa|ed25519)|credentials(?:\.json)?|secrets?\.(?:json|ya?ml))$/i;

export type TokenUsage = { promptTokens: number; completionTokens: number; totalTokens: number; cost?: number };

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateTurnUsage(promptText: string, outputText: string): TokenUsage {
  const promptTokens = estimateTokens(promptText || "");
  const completionTokens = estimateTokens(outputText || "");
  return { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
}

export function normalizeProviderUsage(data: Record<string, unknown>): TokenUsage | undefined {
  const ollamaIn = Number(data.prompt_eval_count || 0);
  const ollamaOut = Number(data.eval_count || 0);
  if (ollamaIn || ollamaOut) {
    return { promptTokens: ollamaIn, completionTokens: ollamaOut, totalTokens: ollamaIn + ollamaOut, cost: 0 };
  }
  const nested = data.response && typeof data.response === "object" ? (data.response as { usage?: unknown }).usage : undefined;
  const raw = (data.usage && typeof data.usage === "object" ? data.usage : nested && typeof nested === "object" ? nested : undefined) as Record<string, unknown> | undefined;
  if (!raw) return undefined;
  const promptTokens = Number(raw.prompt_tokens || raw.input_tokens || raw.promptTokens || 0);
  const completionTokens = Number(raw.completion_tokens || raw.output_tokens || raw.completionTokens || 0);
  const totalTokens = Number(raw.total_tokens || raw.totalTokens || 0) || promptTokens + completionTokens;
  const cost = Number(raw.cost || 0);
  if (!promptTokens && !completionTokens && !totalTokens) return undefined;
  return { promptTokens, completionTokens, totalTokens, ...(cost ? { cost } : {}) };
}

export function resolveEntryUsage<T extends { role?: string; text: string; usage?: TokenUsage }>(entries: T[], index: number): TokenUsage | undefined {
  const entry = entries[index];
  if (entry.usage && entry.usage.totalTokens > 0) return entry.usage;
  if (entry.role !== "ai" || !entry.text.trim()) return undefined;
  const prompt = entries.slice(0, index).filter(item => item.role === "user" || item.role === "ai").map(item => item.text).join("\n");
  return estimateTurnUsage(prompt, entry.text);
}

export function sumConversationUsage<T extends { role?: string; text: string; usage?: TokenUsage }>(entries: T[]) {
  let input = 0;
  let output = 0;
  let cost = 0;
  let measured = 0;
  let top: T | undefined;
  let topTokens = 0;
  for (let index = 0; index < entries.length; index++) {
    const usage = resolveEntryUsage(entries, index);
    if (!usage?.totalTokens) continue;
    measured += 1;
    input += usage.promptTokens;
    output += usage.completionTokens;
    cost += usage.cost || 0;
    if (usage.totalTokens > topTokens) {
      top = entries[index];
      topTokens = usage.totalTokens;
    }
  }
  return { total: input + output, input, output, cost, measured, top, topTokens };
}

export function chunkText(text: string, maxChars = 24_000): string[] {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length) {
    let end = Math.min(maxChars, rest.length);
    if (end < rest.length) {
      const boundary = Math.max(rest.lastIndexOf("\n\n", end), rest.lastIndexOf("\n", end));
      if (boundary > maxChars * 0.6) end = boundary;
    }
    chunks.push(rest.slice(0, end));
    rest = rest.slice(end).trimStart();
  }
  return chunks;
}

export function buildRecentConversation<T extends { kind: string; role?: "user" | "ai"; text: string }>(entries: T[], tokenBudget = 30_000): ConversationMessage[] {
  const candidates = entries
    .filter(entry => entry.kind === "message" && (entry.role === "user" || entry.role === "ai") && entry.text.trim())
    .map(entry => ({ role: entry.role === "ai" ? "assistant" as const : "user" as const, content: entry.text.trim() }));
  const selected: ConversationMessage[] = [];
  let chars = 0;
  let tokens = 0;
  for (let index = candidates.length - 1; index >= 0 && selected.length < MAX_HISTORY_MESSAGES; index--) {
    const item = candidates[index];
    const itemTokens = estimateTokens(item.content);
    if (chars + item.content.length > MAX_HISTORY_CHARS || tokens + itemTokens > tokenBudget) break;
    selected.unshift(item);
    chars += item.content.length;
    tokens += itemTokens;
  }
  return selected;
}

export function parsePendingPatch(text: string): SafePendingPatch {
  const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const value = JSON.parse(clean) as unknown;
  if (!value || typeof value !== "object") throw new Error("invalid_patch");
  const candidate = value as { summary?: unknown; files?: unknown };
  if (!Array.isArray(candidate.files) || candidate.files.length < 1 || candidate.files.length > MAX_PATCH_FILES) throw new Error("invalid_patch_files");
  let totalChars = 0;
  const files = candidate.files.map(item => {
    if (!item || typeof item !== "object") throw new Error("invalid_patch_file");
    const file = item as { path?: unknown; content?: unknown; operation?: unknown };
    if (typeof file.path !== "string" || typeof file.content !== "string" || (file.operation !== "create" && file.operation !== "update")) throw new Error("invalid_patch_file");
    const path = file.path.replace(/\\/g, "/").trim();
    const parts = path.split("/").filter(Boolean);
    const invalidSegment = parts.some(part => part === "." || /[<>:"|?*]/.test(part) || Array.from(part).some(character => character.charCodeAt(0) < 32));
    if (!parts.length || path.startsWith("/") || /^[A-Za-z]:/.test(path) || parts.includes("..") || invalidSegment) throw new Error("unsafe_patch_path");
    if (SENSITIVE_FILE.test(path)) throw new Error("sensitive_patch_path");
    if (file.content.length > MAX_PATCH_FILE_CHARS) throw new Error("patch_file_too_large");
    totalChars += file.content.length;
    if (totalChars > MAX_PATCH_TOTAL_CHARS) throw new Error("patch_too_large");
    return { path, content: file.content, operation: file.operation as "create" | "update" };
  });
  const uniquePaths = new Set(files.map(file => file.path.toLowerCase()));
  if (uniquePaths.size !== files.length) throw new Error("duplicate_patch_path");
  return { summary: typeof candidate.summary === "string" ? candidate.summary.slice(0, 2_000) : "", files };
}
