/**
 * BYO-key model client for proposal generation. OpenAI-compatible endpoints
 * (OpenAI, OpenRouter, DeepSeek, Groq, Together, Ollama /v1, custom) or Anthropic.
 * Config: env ASI_API_KEY / ASI_BASE_URL / ASI_MODEL / ASI_PROVIDER,
 * or .userward/asi/config.json { provider, baseUrl, model, apiKeyEnv }.
 * The key is never written to disk or printed.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { STATE_DIR } from "./core.mjs";

export function readConfig() {
  const path = join(STATE_DIR, "config.json");
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return {}; }
}

export function resolveModelConfig(config = readConfig()) {
  const keyEnv = config.apiKeyEnv || "ASI_API_KEY";
  let apiKey = process.env[keyEnv] || process.env.ASI_API_KEY || "";
  let baseUrl = process.env.ASI_BASE_URL || config.baseUrl || "";
  let model = process.env.ASI_MODEL || config.model || "";
  let provider = (process.env.ASI_PROVIDER || config.provider || "").toLowerCase();

  if (!apiKey && process.env.OPENROUTER_API_KEY) {
    apiKey = process.env.OPENROUTER_API_KEY;
    baseUrl ||= "https://openrouter.ai/api/v1";
  }
  if (!apiKey && process.env.ANTHROPIC_API_KEY) {
    apiKey = process.env.ANTHROPIC_API_KEY;
    provider ||= "anthropic";
  }
  if (!apiKey && process.env.OPENAI_API_KEY) {
    apiKey = process.env.OPENAI_API_KEY;
    baseUrl ||= "https://api.openai.com/v1";
  }
  if (!provider) provider = /anthropic\.com/.test(baseUrl) ? "anthropic" : "openai";
  if (provider === "anthropic") {
    baseUrl ||= "https://api.anthropic.com/v1";
    model ||= "claude-sonnet-4-5";
  } else {
    if (/sk-or-/.test(apiKey)) baseUrl ||= "https://openrouter.ai/api/v1";
    baseUrl ||= "https://api.openai.com/v1";
    model ||= /openrouter\.ai/.test(baseUrl) ? "openrouter/auto" : "gpt-4.1";
  }
  const local = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(`${baseUrl}/`);
  if (!apiKey && local) apiKey = "local";
  return { provider, baseUrl: baseUrl.replace(/\/+$/, ""), model, apiKey, ready: Boolean(apiKey) };
}

export async function callModel({ system, user, maxTokens = 6000, config = resolveModelConfig() }) {
  if (!config.ready) throw new Error("No model key. Set ASI_API_KEY (+ ASI_BASE_URL, ASI_MODEL) or OPENROUTER_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY, or use --edits <file>.");
  const signal = AbortSignal.timeout(240_000);
  if (config.provider === "anthropic") {
    const response = await fetch(`${config.baseUrl}/messages`, {
      method: "POST",
      signal,
      headers: { "x-api-key": config.apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.model, max_tokens: maxTokens, temperature: 0.2, system, messages: [{ role: "user", content: user }] }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Model HTTP ${response.status}: ${data?.error?.message || "request failed"}`);
    return {
      text: (data.content || []).map(part => part.text || "").join(""),
      usage: { promptTokens: data.usage?.input_tokens || 0, completionTokens: data.usage?.output_tokens || 0 },
    };
  }
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...(/openrouter\.ai/.test(config.baseUrl) ? { "HTTP-Referer": "http://127.0.0.1:3001", "X-OpenRouter-Title": "Userward self-upgrade" } : {}),
    },
    body: JSON.stringify({ model: config.model, max_tokens: maxTokens, temperature: 0.2, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Model HTTP ${response.status}: ${data?.error?.message || "request failed"}`);
  return {
    text: data.choices?.[0]?.message?.content || "",
    usage: { promptTokens: data.usage?.prompt_tokens || 0, completionTokens: data.usage?.completion_tokens || 0 },
  };
}

export function parseProposal(text) {
  const raw = String(text || "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Model reply contained no JSON object.");
  const parsed = JSON.parse(raw.slice(start, end + 1));
  return {
    summary: String(parsed.summary || "").slice(0, 500),
    rationale: String(parsed.rationale || "").slice(0, 2000),
    edits: Array.isArray(parsed.edits) ? parsed.edits : [],
    newFiles: Array.isArray(parsed.newFiles) ? parsed.newFiles : [],
  };
}
