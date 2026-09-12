/**
 * Measure Userward Local chat latency: TTFB, total time, tokens.
 * stream:true vs stream:false in analyze mode. Never prints full API key.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const MASK = (key) => (key ? `${key.slice(0, 10)}…${key.slice(-4)} (len=${key.length})` : "none");
const LOCAL = "http://127.0.0.1:3001/api/providers/chat";
const COMPACT = [
  "MODE: DIRECT CHAT / ANALYSIS. Answer the user goal directly and concisely.",
  "OUTPUT: Concise, correct format",
  "SOURCES: Require a source for factual claims",
  "INFERENCE: Label inferences",
  "BUDGET: balanced",
  "Never claim an external action or file change without tool evidence.",
  "Ask only for missing business facts that materially change the answer.",
  "SAFETY: Evaluate silently. Never output policy IDs, scores, or a safety report. Answer the user's goal.",
].join("\n");

function decodeUtf16leStrings(buf) {
  const out = [];
  let i = 0;
  while (i + 1 < buf.length) {
    if (buf[i + 1] === 0 && buf[i] >= 32 && buf[i] < 127) {
      const chars = [];
      while (i + 1 < buf.length && buf[i + 1] === 0 && buf[i] >= 32 && buf[i] < 127) {
        chars.push(String.fromCharCode(buf[i]));
        i += 2;
      }
      if (chars.length >= 12) out.push(chars.join(""));
    } else i += 1;
  }
  return out;
}

function extractConnectionFromBytes(buf) {
  const hay = `${buf.toString("utf8")}\n${decodeUtf16leStrings(buf).join("\n")}`;
  const jsonMatches = hay.match(/\{"provider"\s*:\s*"(?:OpenRouter|OpenAI|Anthropic|Google|DeepSeek|Qwen|Kimi)"\s*,\s*"model"\s*:\s*"[^"]+"\s*,\s*"apiKey"\s*:\s*"[^"]+"}/g) || [];
  for (const raw of jsonMatches.reverse()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.provider === "OpenRouter" && parsed.apiKey && parsed.apiKey !== "local") return parsed;
    } catch { /* ignore */ }
  }
  const keyMatch = hay.match(/sk-or-v1-[A-Za-z0-9_-]{16,}/);
  if (keyMatch) return { provider: "OpenRouter", model: "openrouter/auto", apiKey: keyMatch[0] };
  return null;
}

function loadConnection() {
  if (process.env.OPENROUTER_API_KEY) {
    return { provider: "OpenRouter", model: process.env.OPENROUTER_MODEL || "openrouter/auto", apiKey: process.env.OPENROUTER_API_KEY, source: "env" };
  }
  const roots = [
    join(homedir(), "AppData/Local/Microsoft/Edge/User Data"),
    join(homedir(), "AppData/Local/Google/Chrome/User Data"),
  ];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const profile of ["Default", "Profile 1", "Profile 2"]) {
      for (const store of ["Local Storage/leveldb", "Session Storage"]) {
        const dir = join(root, profile, store);
        if (!existsSync(dir)) continue;
        let files = [];
        try { files = readdirSync(dir); } catch { continue; }
        for (const name of files) {
          if (!/\.(ldb|log|sst)$/i.test(name) && name !== "LOG") continue;
          try {
            const found = extractConnectionFromBytes(readFileSync(join(dir, name)));
            if (found) return { ...found, source: `${root.includes("Edge") ? "Edge" : "Chrome"} ${profile}` };
          } catch { /* locked */ }
        }
      }
    }
  }
  return null;
}

function buildMessages(prompt) {
  return [{ role: "user", content: `${COMPACT}\n\nUSER GOAL:\n${prompt}` }];
}

async function measureNonStream({ apiKey, model, prompt }) {
  const body = { provider: "OpenRouter", apiKey, model, executionMode: "analyze", stream: false, maxOutputTokens: 400, budgetMode: "balanced", messages: buildMessages(prompt) };
  const t0 = performance.now();
  const response = await fetch(LOCAL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  const ttfb = performance.now() - t0;
  const text = await response.text();
  const total = performance.now() - t0;
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text.slice(0, 200) }; }
  const usage = data.usage || {};
  return {
    ok: response.ok,
    status: response.status,
    ttfbSec: Math.round(ttfb) / 1000,
    totalSec: Math.round(total) / 1000,
    promptTokens: Number(usage.promptTokens ?? usage.prompt_tokens ?? 0),
    completionTokens: Number(usage.completionTokens ?? usage.completion_tokens ?? 0),
    selectedModel: data.selectedModel || model,
    textLen: String(data.text || data.error || "").length,
    error: data.error,
  };
}

async function measureStream({ apiKey, model, prompt }) {
  const body = { provider: "OpenRouter", apiKey, model, executionMode: "analyze", stream: true, maxOutputTokens: 400, budgetMode: "balanced", messages: buildMessages(prompt) };
  const t0 = performance.now();
  const response = await fetch(LOCAL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  let ttfb = performance.now() - t0;
  if (!response.ok || !response.body) {
    const text = await response.text();
    return { ok: false, status: response.status, ttfbSec: Math.round(ttfb) / 1000, totalSec: Math.round(performance.now() - t0) / 1000, error: text.slice(0, 200) };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let firstTokenSec = null;
  let selectedModel = model;
  let textLen = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event.started) ttfb = performance.now() - t0;
        if (event.delta) {
          if (firstTokenSec == null) firstTokenSec = Math.round(performance.now() - t0) / 1000;
          textLen += event.delta.length;
        }
        if (event.selectedModel) selectedModel = event.selectedModel;
        if (event.error) return { ok: false, ttfbSec: Math.round(ttfb) / 1000, totalSec: Math.round(performance.now() - t0) / 1000, error: event.error };
      } catch { /* skip */ }
    }
  }
  const totalSec = Math.round(performance.now() - t0) / 1000;
  return { ok: true, ttfbSec: Math.round(ttfb) / 1000, firstTokenSec: firstTokenSec ?? totalSec, totalSec, selectedModel, textLen };
}

async function measureDirectOpenRouter({ apiKey, model, prompt }) {
  const t0 = performance.now();
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "http://127.0.0.1:3001", "X-OpenRouter-Title": "Userward latency baseline" },
    body: JSON.stringify({ model, messages: buildMessages(prompt), max_tokens: 400, stream: false }),
    signal: AbortSignal.timeout(90_000),
  });
  const ttfb = performance.now() - t0;
  const text = await response.text();
  const total = performance.now() - t0;
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  const usage = data.usage || {};
  return {
    ok: response.ok,
    ttfbSec: Math.round(ttfb) / 1000,
    totalSec: Math.round(total) / 1000,
    promptTokens: Number(usage.prompt_tokens ?? 0),
    completionTokens: Number(usage.completion_tokens ?? 0),
    selectedModel: data.model || model,
  };
}

async function localUp() {
  try {
    const r = await fetch("http://127.0.0.1:3001/", { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch { return false; }
}

const connection = loadConnection();
const serverUp = await localUp();
const prompts = ["hi", "explain PDF in one sentence"];

if (!connection) {
  console.log(JSON.stringify({ ok: false, serverUp, blocked: "No OpenRouter key found", howTo: "Set OPENROUTER_API_KEY or save connection in Userward with remember key" }, null, 2));
  process.exit(2);
}
if (!serverUp) {
  console.log(JSON.stringify({ ok: false, blocked: "Server not running at http://127.0.0.1:3001", model: connection.model, keyMasked: MASK(connection.apiKey) }, null, 2));
  process.exit(2);
}

async function safe(label, fn) {
  try { return await fn(); }
  catch (error) { return { ok: false, error: String(error?.message || error), label }; }
}

const results = [];
for (const prompt of prompts) {
  const row = { prompt };
  row.streamFalse = await safe("streamFalse", () => measureNonStream({ apiKey: connection.apiKey, model: connection.model, prompt }));
  await new Promise(r => setTimeout(r, 300));
  row.streamTrue = await safe("streamTrue", () => measureStream({ apiKey: connection.apiKey, model: connection.model, prompt }));
  await new Promise(r => setTimeout(r, 300));
  row.directOpenRouter = await safe("direct", () => measureDirectOpenRouter({ apiKey: connection.apiKey, model: connection.model, prompt }));
  results.push(row);
  await new Promise(r => setTimeout(r, 400));
}

console.log(JSON.stringify({
  ok: true,
  model: connection.model,
  keySource: connection.source,
  keyMasked: MASK(connection.apiKey),
  server: LOCAL,
  results,
  summary: {
    avgStreamFalseTotal: results.filter(r => r.streamFalse?.totalSec).length
      ? Math.round(results.filter(r => r.streamFalse?.totalSec).reduce((s, r) => s + r.streamFalse.totalSec, 0) / results.filter(r => r.streamFalse?.totalSec).length * 10) / 10
      : null,
    avgStreamTrueFirstToken: results.filter(r => r.streamTrue?.firstTokenSec).length
      ? Math.round(results.filter(r => r.streamTrue?.firstTokenSec).reduce((s, r) => s + (r.streamTrue.firstTokenSec ?? r.streamTrue.totalSec), 0) / results.filter(r => r.streamTrue?.firstTokenSec).length * 10) / 10
      : null,
    avgStreamTrueTotal: results.filter(r => r.streamTrue?.totalSec).length
      ? Math.round(results.filter(r => r.streamTrue?.totalSec).reduce((s, r) => s + r.streamTrue.totalSec, 0) / results.filter(r => r.streamTrue?.totalSec).length * 10) / 10
      : null,
    avgDirectTotal: results.filter(r => r.directOpenRouter?.totalSec).length
      ? Math.round(results.filter(r => r.directOpenRouter?.totalSec).reduce((s, r) => s + r.directOpenRouter.totalSec, 0) / results.filter(r => r.directOpenRouter?.totalSec).length * 10) / 10
      : null,
    selectedModels: [...new Set(results.flatMap(r => [r.streamFalse.selectedModel, r.streamTrue.selectedModel, r.directOpenRouter.selectedModel].filter(Boolean)))],
  },
}, null, 2));
